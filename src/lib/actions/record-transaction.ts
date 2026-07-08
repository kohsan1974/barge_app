"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { cleanseSiteName } from "@/lib/cleansing";
import { isUniqueViolation, withDbRetry } from "@/lib/db-utils";
import { toCenti, fromCenti } from "@/lib/quantity";
import { validateBusinessDate } from "@/lib/business-date";

export type RecordTransactionState = {
  error: string | null;
  success?: boolean;
};

const GROUP_PREFIX = "group:";

// 「登録タンクの総量のみで表示する」バージは、記録画面でもタンク単位ではなくバージ単位の
// 1エントリとして扱う。そのため受入れタンク／搬入タンクのidは実タンクidか `group:<bargeId>` の
// いずれかを取り得る。以下はその解決・分配ロジック
type MemberMeta = { id: string; name: string; allowedItemTypeIds: Set<string> };
type ResolvedTarget = { label: string; members: MemberMeta[] };

async function resolveTarget(
  ref: string,
  departmentId: string,
): Promise<{ error?: string; target?: ResolvedTarget }> {
  if (ref.startsWith(GROUP_PREFIX)) {
    const bargeId = ref.slice(GROUP_PREFIX.length);
    const barge = await prisma.barge.findUnique({
      where: { id: bargeId },
      select: { name: true, status: true, showTotalOnly: true },
    });
    if (!barge || barge.status !== "ACTIVE" || !barge.showTotalOnly) {
      return { error: "指定されたバージが見つからないか、総量のみ表示の設定ではありません" };
    }
    const vessels = await prisma.vessel.findMany({
      where: { bargeId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        departmentLinks: { select: { departmentId: true } },
        allowedContents: { select: { itemTypeId: true } },
      },
    });
    const members: MemberMeta[] = vessels
      .filter((v) => {
        const deptIds = v.departmentLinks.map((l) => l.departmentId);
        return deptIds.length === 0 || deptIds.includes(departmentId);
      })
      .map((v) => ({
        id: v.id,
        name: v.name,
        allowedItemTypeIds: new Set(v.allowedContents.map((c) => c.itemTypeId)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
    if (members.length === 0) {
      return { error: "このバージには選択した部署で利用できるタンクがありません" };
    }
    return { target: { label: barge.name, members } };
  }

  const vessel = await prisma.vessel.findUnique({
    where: { id: ref },
    select: {
      name: true,
      status: true,
      departmentLinks: { select: { departmentId: true } },
      allowedContents: { select: { itemTypeId: true } },
      barge: { select: { name: true, status: true } },
    },
  });
  if (!vessel || vessel.status !== "ACTIVE" || (vessel.barge && vessel.barge.status !== "ACTIVE")) {
    return { error: "タンクが見つからないか廃止済みです" };
  }
  const deptIds = vessel.departmentLinks.map((l) => l.departmentId);
  if (deptIds.length > 0 && !deptIds.includes(departmentId)) {
    return { error: "このタンクは別の部署に割り当てられているため選択できません" };
  }
  return {
    target: {
      label: vessel.barge ? `${vessel.barge.name}-${vessel.name}` : vessel.name,
      members: [
        {
          id: ref,
          name: vessel.name,
          allowedItemTypeIds: new Set(vessel.allowedContents.map((c) => c.itemTypeId)),
        },
      ],
    },
  };
}

type LockedMember = MemberMeta & { balanceCenti: number; maxCenti: number };

// 対象タンク群の行ロックを取得し、残高・最大容量とあわせて返す
async function lockMembers(
  tx: Prisma.TransactionClient,
  members: MemberMeta[],
): Promise<LockedMember[]> {
  const ids = members.map((m) => m.id);
  const rows = await tx.$queryRaw<
    { id: string; currentBalance: string; maxCapacity: string }[]
  >`SELECT "id", "currentBalance", "maxCapacity" FROM "master_vessel" WHERE "id" = ANY(${ids}) ORDER BY "id" ASC FOR UPDATE`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return members.map((m) => {
    const row = byId.get(m.id);
    if (!row) throw new Error("タンクが見つかりません");
    return { ...m, balanceCenti: toCenti(row.currentBalance), maxCenti: toCenti(row.maxCapacity) };
  });
}

// 指定内容物を扱えるタンクへ、名前の昇順で満たす／引き出す形で数量を分配する。
// deltaCenti が正なら加算（受入・振替先）、負なら減算（処理・出荷・振替元）
function distribute(
  members: LockedMember[],
  itemTypeId: string,
  deltaCenti: number,
): { allocations: { id: string; deltaCenti: number; nextBalanceCenti: number }[]; shortfall: number } {
  const eligible = members.filter((m) => m.allowedItemTypeIds.has(itemTypeId));
  const sign = deltaCenti > 0 ? 1 : -1;
  let remaining = Math.abs(deltaCenti);
  const allocations: { id: string; deltaCenti: number; nextBalanceCenti: number }[] = [];

  for (const m of eligible) {
    if (remaining === 0) break;
    const room = sign > 0 ? m.maxCenti - m.balanceCenti : m.balanceCenti;
    if (room <= 0) continue;
    const take = Math.min(room, remaining);
    remaining -= take;
    const applied = sign > 0 ? take : -take;
    allocations.push({ id: m.id, deltaCenti: applied, nextBalanceCenti: m.balanceCenti + applied });
  }

  return { allocations, shortfall: remaining };
}

export async function recordTransaction(
  _prevState: RecordTransactionState,
  formData: FormData,
): Promise<RecordTransactionState> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { error: "ログインが必要です" };

  const departmentId = String(formData.get("departmentId") ?? "");
  const vesselRef = String(formData.get("vesselId") ?? "");
  // 搬入タンク（振替元・任意）。指定されるとタンク間振替として扱う
  const sourceRef = String(formData.get("sourceVesselId") ?? "") || null;
  // 現場は自由入力（クレンジング規則：前後trim）。既存名と一致すれば再利用、なければ新規登録する
  const siteName = cleanseSiteName(String(formData.get("siteName") ?? ""));
  const shipId = String(formData.get("shipId") ?? "") || null;
  const truckId = String(formData.get("truckId") ?? "") || null;
  const businessDateRaw = String(formData.get("businessDate") ?? "");
  const itemTypeIds = formData.getAll("itemTypeId").map(String);
  const quantities = formData.getAll("quantity").map((v) => Number(v));

  if (!departmentId || !vesselRef || !businessDateRaw) {
    return { error: "入力内容が不正です" };
  }
  if (itemTypeIds.length === 0 || itemTypeIds.some((v) => !v)) {
    return { error: "品目を選択してください" };
  }

  // JWTセッションが残っていても、無効化済みアカウントからの記録は拒否する
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!me?.isActive) {
    return { error: "アカウントが無効化されています。管理者に確認してください" };
  }

  // ログインユーザーが選択した部署としての記録権限を持っているか確認する
  const assignment = await prisma.operatorDepartment.findFirst({
    where: { userId, departmentId, isActive: true },
  });
  if (!assignment) {
    return { error: "この部署としての記録権限がありません" };
  }

  const department = await prisma.department.findUniqueOrThrow({ where: { id: departmentId } });
  const transactionType = department.type === "TRANSPORT" ? "RECEIVE" : "PROCESS";

  // 公的機関提出時に「どの現場での受入か」が欠落しないよう、搬入は現場を必須にする。
  // 本船は陸の施設からの受入もあるため任意
  if (transactionType === "RECEIVE" && !siteName) {
    return { error: "搬入の場合は現場を入力してください" };
  }

  // 現場名を解決する。現場名は全体で一意（一つの現場を複数部署が共用できる）。
  // 同名現場があれば再利用（重複登録防止）、なければ新規登録し、いずれも今回の部署とのリンクを保証する
  let siteId: string | null = null;
  if (siteName) {
    const existingSite = await prisma.site.findFirst({ where: { name: siteName } });
    if (existingSite) {
      siteId = existingSite.id;
      if (!existingSite.isActive) {
        // 無効化済みの現場名が再び使われた場合は再有効化して記録を継続する
        await prisma.site.update({ where: { id: existingSite.id }, data: { isActive: true } });
      }
      // この部署で初めて使う現場ならリンクを自動追加する（別部署が先に登録していた現場の共用）
      await prisma.siteDepartment.upsert({
        where: { siteId_departmentId: { siteId: existingSite.id, departmentId } },
        update: {},
        create: { siteId: existingSite.id, departmentId },
      });
    } else {
      try {
        const createdSite = await prisma.site.create({
          data: { name: siteName, departmentLinks: { create: { departmentId } } },
        });
        siteId = createdSite.id;
      } catch (e) {
        // 同時送信で先に同名現場が作られた場合（unique制約違反）は、その既存現場を使う
        if (!isUniqueViolation(e)) throw e;
        const raced = await prisma.site.findFirst({ where: { name: siteName } });
        if (!raced) return { error: "現場の登録に失敗しました。もう一度お試しください" };
        siteId = raced.id;
        await prisma.siteDepartment.upsert({
          where: { siteId_departmentId: { siteId: raced.id, departmentId } },
          update: {},
          create: { siteId: raced.id, departmentId },
        });
      }
    }
  }

  // 廃止済み・部署不一致のタンク／バージへの記録をUI外からのリクエストでも拒否する
  const destResult = await resolveTarget(vesselRef, departmentId);
  if (destResult.error || !destResult.target) return { error: destResult.error ?? "タンクが見つかりません" };
  const destTarget = destResult.target;

  // 搬入タンク（振替元）が指定された場合の検証。振替は搬入(RECEIVE)時のみ利用できる
  let sourceTarget: ResolvedTarget | null = null;
  if (sourceRef) {
    if (transactionType !== "RECEIVE") {
      return { error: "タンク間振替は搬入の場合のみ利用できます" };
    }
    if (sourceRef === vesselRef) {
      return { error: "搬入タンクは受入れタンクと異なるタンクを選んでください" };
    }
    const sourceResult = await resolveTarget(sourceRef, departmentId);
    if (sourceResult.error || !sourceResult.target) {
      return { error: sourceResult.error ?? "搬入タンクが見つかりません" };
    }
    sourceTarget = sourceResult.target;
    const destIds = new Set(destTarget.members.map((m) => m.id));
    if (sourceTarget.members.some((m) => destIds.has(m.id))) {
      return { error: "搬入タンクと受入れタンクが重複しています" };
    }
  }

  if (transactionType === "RECEIVE" && shipId) {
    // 本船は選択された現場に登録されているものだけを許可する（UI外からの不正値も弾く）
    const linked = siteId
      ? await prisma.siteShip.findUnique({ where: { siteId_shipId: { siteId, shipId } } })
      : null;
    if (!linked) return { error: "選択した本船はこの現場に登録されていません" };
  }
  if (transactionType === "RECEIVE" && truckId) {
    // トラックは記録者が選択した部署に属するものだけを許可する（UI外からの不正値も弾く）
    const truck = await prisma.truck.findUnique({ where: { id: truckId }, select: { departmentId: true } });
    if (!truck || truck.departmentId !== departmentId) {
      return { error: "選択したトラックはこの部署に登録されていません" };
    }
  }

  // 選択された内容物が、対象タンク群のいずれかに登録されているか確認する（UI外からの不正値も弾く）。
  // 「総量のみ表示」バージはタンクごとの登録内容物の和集合で判定する
  const destAllowed = new Set(destTarget.members.flatMap((m) => [...m.allowedItemTypeIds]));
  if (itemTypeIds.some((id) => !destAllowed.has(id))) {
    return { error: "このタンクに登録されていない内容物が含まれています" };
  }
  if (sourceTarget) {
    const sourceAllowed = new Set(sourceTarget.members.flatMap((m) => [...m.allowedItemTypeIds]));
    if (itemTypeIds.some((id) => !sourceAllowed.has(id))) {
      return { error: "搬入タンクに登録されていない内容物が含まれています" };
    }
  }

  const slipId = randomUUID();
  // 未来日・1年より前の日付を拒否（台帳の時系列の信頼性を守る）
  const dateCheck = validateBusinessDate(businessDateRaw);
  if (dateCheck.error || !dateCheck.date) {
    return { error: dateCheck.error ?? "業務日が正しくありません" };
  }
  const businessDate = dateCheck.date;

  try {
    // Neonのコールドスタート（朝一の接続失敗）対策。開始前の失敗のみ安全に再試行される
    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        if (sourceTarget) {
          // タンク間振替：デッドロック回避のため、対象タンクをまとめてid昇順でロックする
          const allMembers = [...destTarget.members, ...sourceTarget.members];
          const locked = await lockMembers(tx, allMembers);
          const destLocked = destTarget.members.map((m) => locked.find((l) => l.id === m.id)!);
          const sourceLocked = sourceTarget.members.map((m) => locked.find((l) => l.id === m.id)!);
          const reason = `タンク間振替: ${sourceTarget.label} → ${destTarget.label}`;

          for (let i = 0; i < itemTypeIds.length; i++) {
            const quantityCenti = toCenti(quantities[i]);
            if (!Number.isFinite(quantityCenti) || quantityCenti <= 0) {
              throw new Error("振替数量は0より大きい値を入力してください");
            }

            const destDist = distribute(destLocked, itemTypeIds[i], quantityCenti);
            if (destDist.shortfall > 0) {
              throw new Error(`受入れタンクの最大容量を超えています（残り ${fromCenti(destDist.shortfall)}kL 分が入りません）`);
            }
            const sourceDist = distribute(sourceLocked, itemTypeIds[i], -quantityCenti);
            if (sourceDist.shortfall > 0) {
              throw new Error(`搬入タンクの残量を超える振替はできません（不足 ${fromCenti(sourceDist.shortfall)}kL）`);
            }

            for (const a of sourceDist.allocations) {
              await tx.tankTransaction.create({
                data: {
                  slipId,
                  businessDate,
                  transactionType: "PROCESS",
                  vesselId: a.id,
                  recordedById: userId,
                  departmentId,
                  itemTypeId: itemTypeIds[i],
                  quantity: fromCenti(a.deltaCenti),
                  balanceAfter: fromCenti(a.nextBalanceCenti),
                  reason,
                },
              });
              const m = sourceLocked.find((x) => x.id === a.id)!;
              m.balanceCenti = a.nextBalanceCenti;
            }
            for (const a of destDist.allocations) {
              await tx.tankTransaction.create({
                data: {
                  slipId,
                  businessDate,
                  transactionType: "RECEIVE",
                  vesselId: a.id,
                  recordedById: userId,
                  departmentId,
                  siteId,
                  shipId,
                  truckId,
                  itemTypeId: itemTypeIds[i],
                  quantity: fromCenti(a.deltaCenti),
                  balanceAfter: fromCenti(a.nextBalanceCenti),
                  reason,
                },
              });
              const m = destLocked.find((x) => x.id === a.id)!;
              m.balanceCenti = a.nextBalanceCenti;
            }
          }

          for (const m of [...destLocked, ...sourceLocked]) {
            await tx.vessel.update({ where: { id: m.id }, data: { currentBalance: fromCenti(m.balanceCenti) } });
          }
          return;
        }

        // 通常の搬入・処理（振替なし）
        const locked = await lockMembers(tx, destTarget.members);
        // グループ（総量のみ表示バージ）を選んでいて複数タンクに分配される場合の説明用ラベル
        const groupReason = destTarget.members.length > 1 ? `${destTarget.label}内で複数タンクに分配` : null;

        for (let i = 0; i < itemTypeIds.length; i++) {
          const quantityCenti = toCenti(quantities[i]);
          if (!Number.isFinite(quantityCenti) || quantityCenti === 0) {
            throw new Error("数量は0以外の値を入力してください");
          }

          // 搬入(RECEIVE)は入力値の符号をそのまま残高に反映する（正=搬入・負=出荷）。
          // 処理(PROCESS)は従来通り常に減算のみ（誤操作防止のため、入力は正の値に限る）
          let signedCenti: number;
          if (transactionType === "RECEIVE") {
            signedCenti = quantityCenti;
          } else {
            if (quantityCenti < 0) {
              throw new Error("処理の数量は0より大きい値を入力してください");
            }
            signedCenti = -quantityCenti;
          }

          const dist = distribute(locked, itemTypeIds[i], signedCenti);
          if (dist.shortfall > 0) {
            throw new Error(
              signedCenti > 0
                ? `タンクの最大容量を超えています（残り ${fromCenti(dist.shortfall)}kL 分が入りません）`
                : `タンクの残量を超える数量は記録できません（不足 ${fromCenti(dist.shortfall)}kL）`,
            );
          }

          for (const a of dist.allocations) {
            await tx.tankTransaction.create({
              data: {
                slipId,
                businessDate,
                transactionType,
                vesselId: a.id,
                recordedById: userId,
                departmentId,
                siteId,
                shipId: transactionType === "RECEIVE" ? shipId : null,
                truckId: transactionType === "RECEIVE" ? truckId : null,
                itemTypeId: itemTypeIds[i],
                quantity: fromCenti(a.deltaCenti),
                balanceAfter: fromCenti(a.nextBalanceCenti),
                reason: groupReason,
              },
            });
            const m = locked.find((x) => x.id === a.id)!;
            m.balanceCenti = a.nextBalanceCenti;
          }
        }

        for (const m of locked) {
          await tx.vessel.update({ where: { id: m.id }, data: { currentBalance: fromCenti(m.balanceCenti) } });
        }
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "記録に失敗しました" };
  }

  revalidatePath("/barges");
  revalidatePath("/record");
  revalidatePath("/admin/sites");
  return { error: null, success: true };
}
