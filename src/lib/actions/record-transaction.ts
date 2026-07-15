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
import { vesselLabel } from "@/lib/labels";

export type RecordTransactionState = {
  error: string | null;
  success?: boolean;
};

const GROUP_PREFIX = "group:";

// 作業内容（record-form.tsxと対応）。業務フロー:
//   運輸: 外部 →トラック→ 受入れタンク（RECEIVE のみ）
//   船舶: 外部 → 収集バージ（RECEIVE）→ 受入れタンクへ SHIFT
//   恵比寿: タンク → 受入れタンクへの SHIFT と、最終処分の DISCHARGE（放流・水）/ SHIPOUT（出荷・油）
// 台帳上は RECEIVE=RECEIVE行(+)、SHIFT=PROCESS(-)+RECEIVE(+)のペア、放流/出荷=PROCESS行(-)+reason
const OPERATION_LABELS = {
  RECEIVE: "搬入",
  SHIFT: "シフト",
  DISCHARGE: "放流",
  SHIPOUT: "出荷",
} as const;
type Operation = keyof typeof OPERATION_LABELS;

// 「登録タンクの総量のみで表示する」バージは、記録画面でもタンク単位ではなくバージ単位の
// 1エントリとして扱う。そのためタンクのidは実タンクidか `group:<bargeId>` のいずれかを取り得る。
// 以下はその解決・分配ロジック
type MemberMeta = { id: string; name: string; allowedItemTypeIds: Set<string> };
type ResolvedTarget = { label: string; members: MemberMeta[] };

async function resolveTarget(
  ref: string,
  departmentId: string,
  role: "dest" | "source",
): Promise<{ error?: string; target?: ResolvedTarget }> {
  const roleLabel = role === "dest" ? "入れる側" : "出す側";
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
        departmentLinks: { select: { departmentId: true, allowReceiving: true, allowSourcing: true } },
        allowedContents: { select: { itemTypeId: true } },
      },
    });
    // 役割（受入れ・搬入元）はバージ単位ではなく「タンク×部署」の組ごとに判定する。
    // 所属部署のないタンクはどの部署にも属さないため、このグループには一切寄与しない
    const members: MemberMeta[] = vessels
      .filter((v) => {
        const link = v.departmentLinks.find((l) => l.departmentId === departmentId);
        if (!link) return false;
        return role === "dest" ? link.allowReceiving : link.allowSourcing;
      })
      .map((v) => ({
        id: v.id,
        name: v.name,
        allowedItemTypeIds: new Set(v.allowedContents.map((c) => c.itemTypeId)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
    if (members.length === 0) {
      return { error: `このバージには選択した部署で${roleLabel}として利用できるタンクがありません` };
    }
    return { target: { label: barge.name, members } };
  }

  const vessel = await prisma.vessel.findUnique({
    where: { id: ref },
    select: {
      name: true,
      status: true,
      departmentLinks: { select: { departmentId: true, allowReceiving: true, allowSourcing: true } },
      allowedContents: { select: { itemTypeId: true } },
      barge: { select: { name: true, status: true } },
    },
  });
  if (!vessel || vessel.status !== "ACTIVE" || (vessel.barge && vessel.barge.status !== "ACTIVE")) {
    return { error: "タンクが見つからないか廃止済みです" };
  }
  // 所属部署のないタンクはどの部署にも属さないため選択不可。所属部署があれば、
  // 選択中の部署とのリンクの役割設定に従う
  const link = vessel.departmentLinks.find((l) => l.departmentId === departmentId);
  if (!link) {
    return {
      error:
        vessel.departmentLinks.length === 0
          ? "このタンクはどの部署にも割り当てられていません。管理者にタンクマスタでの部署割り当てを依頼してください"
          : "このタンクは別の部署に割り当てられているため選択できません",
    };
  }
  if (role === "dest" ? !link.allowReceiving : !link.allowSourcing) {
    return { error: `このタンクはこの部署では${roleLabel}として利用できません` };
  }
  return {
    target: {
      label: vesselLabel(vessel),
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
// deltaCenti が正なら加算（搬入・シフト先）、負なら減算（シフト元・放流・出荷）
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
  const operationRaw = String(formData.get("operation") ?? "");
  const vesselRef = String(formData.get("vesselId") ?? "");
  // シフトの移動元タンク
  const sourceRef = String(formData.get("sourceVesselId") ?? "") || null;
  // 現場は自由入力（クレンジング規則：前後trim）。既存名と一致すれば再利用、なければ新規登録する
  const siteName = cleanseSiteName(String(formData.get("siteName") ?? ""));
  const shipId = String(formData.get("shipId") ?? "") || null;
  const truckId = String(formData.get("truckId") ?? "") || null;
  const businessDateRaw = String(formData.get("businessDate") ?? "");
  const itemTypeIds = formData.getAll("itemTypeId").map(String);
  const quantities = formData.getAll("quantity").map((v) => Number(v));
  // 二重送信（連打・通信リトライ）の冪等ガード用。クライアントが記録フォームごとに発行するUUID。
  // トランザクション先頭でrecord_submissionsにINSERTし、二重目は一意制約で弾いて連投を防ぐ
  const submissionId = String(formData.get("submissionId") ?? "") || null;

  if (!departmentId || !vesselRef || !businessDateRaw) {
    return { error: "入力内容が不正です" };
  }
  if (!(operationRaw in OPERATION_LABELS)) {
    return { error: "作業内容が不正です" };
  }
  const operation = operationRaw as Operation;
  const operationLabel = OPERATION_LABELS[operation];
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
  // 部署種別ごとに選べる作業内容を制限する（UI外からの不正リクエストも弾く）。
  // 搬入（外部からの受入）は運搬部署のみ、放流・出荷（外部への払い出し）は処理部署のみ
  const allowedOperations: Operation[] =
    department.type === "TRANSPORT" ? ["RECEIVE", "SHIFT"] : ["SHIFT", "DISCHARGE", "SHIPOUT"];
  if (!allowedOperations.includes(operation)) {
    return { error: "この部署では選択できない作業内容です" };
  }

  // 公的機関提出時に「どの現場での受入か」「どこへ出荷したか」が欠落しないよう、
  // 搬入は現場を、出荷は出荷先を必須にする（出荷先は台帳上siteIdと同じ場所に記録する）。
  // シフト・放流はタンク内部の作業のため現場を記録しない（入力があっても無視する）
  if (operation === "RECEIVE" && !siteName) {
    return { error: "搬入の場合は現場を入力してください" };
  }
  if (operation === "SHIPOUT" && !siteName) {
    return { error: "出荷の場合は出荷先を入力してください" };
  }
  const effectiveSiteName = operation === "RECEIVE" || operation === "SHIPOUT" ? siteName : "";

  // 現場名を解決する。現場名は全体で一意（一つの現場を複数部署が共用できる）。
  // 同名現場があれば再利用（重複登録防止）、なければ新規登録し、いずれも今回の部署とのリンクを保証する
  let siteId: string | null = null;
  if (effectiveSiteName) {
    const existingSite = await prisma.site.findFirst({ where: { name: effectiveSiteName } });
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
          data: { name: effectiveSiteName, departmentLinks: { create: { departmentId } } },
        });
        siteId = createdSite.id;
      } catch (e) {
        // 同時送信で先に同名現場が作られた場合（unique制約違反）は、その既存現場を使う
        if (!isUniqueViolation(e)) throw e;
        const raced = await prisma.site.findFirst({ where: { name: effectiveSiteName } });
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

  // 対象タンクの解決（廃止済み・部署不一致・役割不一致はUI外からのリクエストでも拒否する）。
  // 搬入・シフトの vesselRef は「入れる側」、放流・出荷の vesselRef は「出す側」
  const mainRole = operation === "DISCHARGE" || operation === "SHIPOUT" ? "source" : "dest";
  const mainResult = await resolveTarget(vesselRef, departmentId, mainRole);
  if (mainResult.error || !mainResult.target) {
    return { error: mainResult.error ?? "タンクが見つかりません" };
  }
  const mainTarget = mainResult.target;

  // シフトの移動元の検証
  let sourceTarget: ResolvedTarget | null = null;
  if (operation === "SHIFT") {
    if (!sourceRef) {
      return { error: "シフトでは移動元タンクを選択してください" };
    }
    if (sourceRef === vesselRef) {
      return { error: "移動元と移動先には異なるタンクを選んでください" };
    }
    const sourceResult = await resolveTarget(sourceRef, departmentId, "source");
    if (sourceResult.error || !sourceResult.target) {
      return { error: sourceResult.error ?? "移動元タンクが見つかりません" };
    }
    sourceTarget = sourceResult.target;
    const destIds = new Set(mainTarget.members.map((m) => m.id));
    if (sourceTarget.members.some((m) => destIds.has(m.id))) {
      return { error: "移動元と移動先のタンクが重複しています" };
    }
  }

  // 本船・トラックは搬入のときだけ意味を持つ（他の作業では記録しない）
  const effectiveShipId = operation === "RECEIVE" ? shipId : null;
  const effectiveTruckId = operation === "RECEIVE" ? truckId : null;
  if (operation === "RECEIVE") {
    // トラックを持つ部署（運輸）の搬入は必ずトラックで行われるため、選択を必須にする
    const activeTruckCount = await prisma.truck.count({ where: { departmentId, isActive: true } });
    if (activeTruckCount > 0 && !effectiveTruckId) {
      return { error: "トラックを選択してください（この部署の搬入はトラックで行われます）" };
    }
  }
  if (effectiveShipId) {
    // 本船は選択された現場に登録されているものだけを許可する（UI外からの不正値も弾く）
    const linked = siteId
      ? await prisma.siteShip.findUnique({ where: { siteId_shipId: { siteId, shipId: effectiveShipId } } })
      : null;
    if (!linked) return { error: "選択した本船はこの現場に登録されていません" };
  }
  if (effectiveTruckId) {
    // トラックは記録者が選択した部署に属するものだけを許可する（UI外からの不正値も弾く）
    const truck = await prisma.truck.findUnique({
      where: { id: effectiveTruckId },
      select: { departmentId: true },
    });
    if (!truck || truck.departmentId !== departmentId) {
      return { error: "選択したトラックはこの部署に登録されていません" };
    }
  }

  // 選択された内容物が、対象タンク群のいずれかに登録されているか確認する（UI外からの不正値も弾く）。
  // 「総量のみ表示」バージはタンクごとの登録内容物の和集合で判定する
  const mainAllowed = new Set(mainTarget.members.flatMap((m) => [...m.allowedItemTypeIds]));
  if (itemTypeIds.some((id) => !mainAllowed.has(id))) {
    return { error: "このタンクに登録されていない内容物が含まれています" };
  }
  if (sourceTarget) {
    const sourceAllowed = new Set(sourceTarget.members.flatMap((m) => [...m.allowedItemTypeIds]));
    if (itemTypeIds.some((id) => !sourceAllowed.has(id))) {
      return { error: "移動元タンクに登録されていない内容物が含まれています" };
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
    // Neonのコールドスタート（朝一の接続失敗）対策。開始前の失敗のみ安全に再試行される。
    // グループ（総量のみ表示バージ）のシフトは最大十数行のINSERTになり、Neonの遅延次第で
    // 既定の5秒を超え得るため、タイムアウトに余裕を持たせる
    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        // 冪等ガード：同じ送信が二重に届いたら、ここのINSERTが一意制約(P2002)で失敗し、
        // トランザクション全体がロールバックされる（台帳に1件も追加されない）。
        // 並行する二重送信は、先の送信がコミットするまでこのINSERTがブロックされ、その後P2002になる
        if (submissionId) {
          await tx.recordSubmission.create({ data: { id: submissionId } });
        }

        if (operation === "SHIFT" && sourceTarget) {
          // シフト：デッドロック回避のため、対象タンクをまとめてid昇順でロックする
          const allMembers = [...mainTarget.members, ...sourceTarget.members];
          const locked = await lockMembers(tx, allMembers);
          const destLocked = mainTarget.members.map((m) => locked.find((l) => l.id === m.id)!);
          const sourceLocked = sourceTarget.members.map((m) => locked.find((l) => l.id === m.id)!);
          const reason = `シフト: ${sourceTarget.label} → ${mainTarget.label}`;

          for (let i = 0; i < itemTypeIds.length; i++) {
            const quantityCenti = toCenti(quantities[i]);
            if (!Number.isFinite(quantityCenti) || quantityCenti <= 0) {
              throw new Error("シフトの数量は0より大きい値を入力してください");
            }

            const destDist = distribute(destLocked, itemTypeIds[i], quantityCenti);
            if (destDist.shortfall > 0) {
              throw new Error(`移動先タンクの最大容量を超えています（残り ${fromCenti(destDist.shortfall)}kL 分が入りません）`);
            }
            const sourceDist = distribute(sourceLocked, itemTypeIds[i], -quantityCenti);
            if (sourceDist.shortfall > 0) {
              throw new Error(`移動元タンクの残量を超えるシフトはできません（不足 ${fromCenti(sourceDist.shortfall)}kL）`);
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

        // 搬入（外部→タンク、加算）と放流・出荷（タンク→外部、減算）
        const locked = await lockMembers(tx, mainTarget.members);
        const isOutflow = operation === "DISCHARGE" || operation === "SHIPOUT";
        // グループ（総量のみ表示バージ）で複数タンクに分配される場合の説明用ラベル。
        // 放流・出荷は作業内容そのものをreasonに残す（公的書類で処分方法を区別するため）
        const groupNote = mainTarget.members.length > 1 ? `${mainTarget.label}内で複数タンクに分配` : null;
        const reason = isOutflow ? operationLabel : groupNote;

        for (let i = 0; i < itemTypeIds.length; i++) {
          const quantityCenti = toCenti(quantities[i]);
          if (!Number.isFinite(quantityCenti) || quantityCenti <= 0) {
            throw new Error(`${operationLabel}の数量は0より大きい値を入力してください`);
          }
          const signedCenti = isOutflow ? -quantityCenti : quantityCenti;

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
                transactionType: isOutflow ? "PROCESS" : "RECEIVE",
                vesselId: a.id,
                recordedById: userId,
                departmentId,
                siteId,
                shipId: effectiveShipId,
                truckId: effectiveTruckId,
                itemTypeId: itemTypeIds[i],
                quantity: fromCenti(a.deltaCenti),
                balanceAfter: fromCenti(a.nextBalanceCenti),
                reason,
              },
            });
            const m = locked.find((x) => x.id === a.id)!;
            m.balanceCenti = a.nextBalanceCenti;
          }
        }

        for (const m of locked) {
          await tx.vessel.update({ where: { id: m.id }, data: { currentBalance: fromCenti(m.balanceCenti) } });
        }
      }, { timeout: 15000 }),
    );
  } catch (e) {
    // トランザクション内の一意制約違反は、冪等ガード（record_submissions）の重複＝二重送信のみ。
    // 1件目は既に記録済みなので、2件目は「成功（何もしない）」として返し、連投による重複を防ぐ
    if (isUniqueViolation(e)) {
      revalidatePath("/barges");
      revalidatePath("/record");
      return { error: null, success: true };
    }
    return { error: e instanceof Error ? e.message : "記録に失敗しました" };
  }

  revalidatePath("/barges");
  revalidatePath("/record");
  revalidatePath("/admin/sites");
  return { error: null, success: true };
}
