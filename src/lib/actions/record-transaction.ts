"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
  const siteId = String(formData.get("siteId") ?? "") || null;
  const shipId = String(formData.get("shipId") ?? "") || null;
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

  if (transactionType === "RECEIVE" && !shipId) {
    return { error: "搬入の場合は本船を選択してください" };
  }
  // 公的機関提出時に「どの現場での受入か」が欠落しないよう、搬入は現場を必須にする
  if (transactionType === "RECEIVE" && !siteId) {
    return { error: "搬入の場合は現場を選択してください" };
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
  const businessDate = new Date(businessDateRaw);
  if (Number.isNaN(businessDate.getTime())) {
    return { error: "業務日が正しくありません" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // タンクの行をロックし、複数部署からの同時記録による残量の競合更新を防ぐ
      const locked = await tx.$queryRaw<
        { id: string; currentBalance: string; maxCapacity: string }[]
      >`SELECT "id", "currentBalance", "maxCapacity" FROM "master_vessel" WHERE "id" = ${vesselId} FOR UPDATE`;
      const vessel = locked[0];
      if (!vessel) throw new Error("タンクが見つかりません");

      let balance = Number(vessel.currentBalance);
      const maxCapacity = Number(vessel.maxCapacity);

      for (let i = 0; i < itemTypeIds.length; i++) {
        // DBの精度(小数2桁)に合わせて丸め、クライアント入力との桁ずれをなくす
        const rawQuantity = Math.round(quantities[i] * 100) / 100;
        if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
          throw new Error("数量は0より大きい値を入力してください");
        }

        const signedQuantity = transactionType === "RECEIVE" ? rawQuantity : -rawQuantity;
        const nextBalance = balance + signedQuantity;

        if (transactionType === "RECEIVE" && nextBalance > maxCapacity) {
          throw new Error(`タンクの最大容量(${maxCapacity}kL)を超えています`);
        }
        if (transactionType === "PROCESS" && nextBalance < 0) {
          throw new Error("タンクの残量を超える処理量は記録できません");
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
            itemTypeId: itemTypeIds[i],
            quantity: signedQuantity,
            balanceAfter: nextBalance,
          },
        });

        balance = nextBalance;
      }

      await tx.vessel.update({ where: { id: vesselId }, data: { currentBalance: balance } });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "記録に失敗しました" };
  }

  revalidatePath("/");
  revalidatePath("/record");
  return { error: null, success: true };
}
