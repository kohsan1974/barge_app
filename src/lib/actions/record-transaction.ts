"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cleanseSiteName } from "@/lib/cleansing";
import { isUniqueViolation, withDbRetry } from "@/lib/db-utils";
import { toCenti, fromCenti } from "@/lib/quantity";
import { validateBusinessDate } from "@/lib/business-date";

export type RecordTransactionState = {
  error: string | null;
  success?: boolean;
};

export async function recordTransaction(
  _prevState: RecordTransactionState,
  formData: FormData,
): Promise<RecordTransactionState> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { error: "ログインが必要です" };

  const departmentId = String(formData.get("departmentId") ?? "");
  const vesselId = String(formData.get("vesselId") ?? "");
  // 現場は自由入力（クレンジング規則：前後trim）。既存名と一致すれば再利用、なければ新規登録する
  const siteName = cleanseSiteName(String(formData.get("siteName") ?? ""));
  const shipId = String(formData.get("shipId") ?? "") || null;
  const truckId = String(formData.get("truckId") ?? "") || null;
  const businessDateRaw = String(formData.get("businessDate") ?? "");
  const itemTypeIds = formData.getAll("itemTypeId").map(String);
  const quantities = formData.getAll("quantity").map((v) => Number(v));

  if (!departmentId || !vesselId || !businessDateRaw) {
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

  // 廃止済みのタンク・バージへの記録をUI外からのリクエストでも拒否する
  const vesselMeta = await prisma.vessel.findUnique({
    where: { id: vesselId },
    select: { status: true, departmentId: true, barge: { select: { status: true } } },
  });
  if (
    !vesselMeta ||
    vesselMeta.status !== "ACTIVE" ||
    (vesselMeta.barge && vesselMeta.barge.status !== "ACTIVE")
  ) {
    return { error: "このタンクは廃止済みのため記録できません" };
  }
  // タンクに所属部署が設定されている場合、今回の部署と一致しないUI外からのリクエストを拒否する
  if (vesselMeta.departmentId && vesselMeta.departmentId !== departmentId) {
    return { error: "このタンクは別の部署に割り当てられているため記録できません" };
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

  // 選択された内容物がすべてこのタンクに登録されているか確認する（UI外からの不正値も弾く）
  const allowedLinks = await prisma.vesselItemType.findMany({
    where: { vesselId, itemTypeId: { in: itemTypeIds } },
    select: { itemTypeId: true },
  });
  const allowedIds = new Set(allowedLinks.map((l) => l.itemTypeId));
  if (itemTypeIds.some((id) => !allowedIds.has(id))) {
    return { error: "このタンクに登録されていない内容物が含まれています" };
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
      // タンクの行をロックし、複数部署からの同時記録による残量の競合更新を防ぐ
      const locked = await tx.$queryRaw<
        { id: string; currentBalance: string; maxCapacity: string }[]
      >`SELECT "id", "currentBalance", "maxCapacity" FROM "master_vessel" WHERE "id" = ${vesselId} FOR UPDATE`;
      const vessel = locked[0];
      if (!vessel) throw new Error("タンクが見つかりません");

      // 浮動小数点の誤差による境界比較の誤りを避けるため、1/100 kL 単位の整数で計算する
      let balanceCenti = toCenti(vessel.currentBalance);
      const maxCapacityCenti = toCenti(vessel.maxCapacity);

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
        const nextCenti = balanceCenti + signedCenti;

        if (nextCenti > maxCapacityCenti) {
          throw new Error(`タンクの最大容量(${fromCenti(maxCapacityCenti)}kL)を超えています`);
        }
        if (nextCenti < 0) {
          throw new Error("タンクの残量を超える数量は記録できません");
        }

        await tx.tankTransaction.create({
          data: {
            slipId,
            businessDate,
            transactionType,
            vesselId,
            recordedById: userId,
            departmentId,
            siteId,
            shipId: transactionType === "RECEIVE" ? shipId : null,
            truckId: transactionType === "RECEIVE" ? truckId : null,
            itemTypeId: itemTypeIds[i],
            quantity: fromCenti(signedCenti),
            balanceAfter: fromCenti(nextCenti),
          },
        });

        balanceCenti = nextCenti;
      }

      await tx.vessel.update({
        where: { id: vesselId },
        data: { currentBalance: fromCenti(balanceCenti) },
      });
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
