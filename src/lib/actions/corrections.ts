"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdminUserId } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-utils";
import { toCenti, fromCenti } from "@/lib/quantity";
import { validateBusinessDate, todayJst } from "@/lib/business-date";

export type CorrectionState = {
  error: string | null;
  success?: boolean;
};

// 誤記録の訂正（逆仕訳）。元の行は変更せず、数量の符号を反転したCORRECTION行を追記して相殺する。
// 正しい値の再入力は、訂正後に通常の記録画面から行う（1操作1目的で監査しやすくするため）
export async function createCorrection(
  _prevState: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const adminId = await getAdminUserId();
  if (!adminId) return { error: "管理者権限が必要です" };

  const targetId = String(formData.get("targetId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const businessDateRaw = String(formData.get("businessDate") ?? "") || todayJst();

  if (!targetId) return { error: "訂正対象を選択してください" };
  // 法的証拠の書き換えに相当する操作のため、理由は必須
  if (!reason) return { error: "訂正理由は必須です（例：数量の入力誤り 等）" };

  const dateCheck = validateBusinessDate(businessDateRaw);
  if (dateCheck.error || !dateCheck.date) {
    return { error: dateCheck.error ?? "業務日が正しくありません" };
  }
  const businessDate = dateCheck.date;

  const original = await prisma.tankTransaction.findUnique({
    where: { id: targetId },
    include: { corrections: { select: { id: true } } },
  });
  if (!original) return { error: "訂正対象の記録が見つかりません" };
  if (original.voidedAt !== null) {
    return { error: "取消済みの記録は訂正できません（取消により出力・残量から除外済みです）" };
  }
  if (original.transactionType === "CORRECTION") {
    return { error: "訂正行そのものは訂正できません（誤って訂正した場合は元の記録をもう一度訂正するのではなく、通常の記録で正しい値を入力してください）" };
  }
  if (original.transactionType === "CALIBRATION") {
    return { error: "残量調整の訂正は、残量調整（キャリブレーション）をもう一度実行してください" };
  }
  if (original.corrections.length > 0) {
    return { error: "この記録はすでに訂正済みです（二重訂正はできません）" };
  }

  try {
    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        // タンク行をロックし、同時記録との競合と二重訂正を防ぐ
        const locked = await tx.$queryRaw<
          { id: string; currentBalance: string; maxCapacity: string }[]
        >`SELECT "id", "currentBalance", "maxCapacity" FROM "master_vessel" WHERE "id" = ${original.vesselId} FOR UPDATE`;
        const vessel = locked[0];
        if (!vessel) throw new Error("対象のタンクが見つかりません");

        // ロック取得後に再確認（同時に同じ訂正が実行されるレースを塞ぐ）
        const alreadyCorrected = await tx.tankTransaction.count({
          where: { referenceTransactionId: original.id },
        });
        if (alreadyCorrected > 0) {
          throw new Error("この記録はすでに訂正済みです（二重訂正はできません）");
        }

        // 浮動小数点誤差を避けるため 1/100 kL 単位の整数で計算する
        const balanceCenti = toCenti(vessel.currentBalance);
        const maxCapacityCenti = toCenti(vessel.maxCapacity);
        const reversalCenti = -toCenti(String(original.quantity)); // 符号反転＝逆仕訳
        const nextCenti = balanceCenti + reversalCenti;

        if (nextCenti < 0) {
          throw new Error(
            `訂正すると残量がマイナス（${fromCenti(nextCenti)}kL）になります。この搬入分はすでに処理済みの可能性があるため、残量調整（キャリブレーション）での補正を検討してください`,
          );
        }
        if (nextCenti > maxCapacityCenti) {
          throw new Error(
            `訂正すると残量が最大容量（${fromCenti(maxCapacityCenti)}kL）を超えます。残量調整（キャリブレーション）での補正を検討してください`,
          );
        }

        await tx.tankTransaction.create({
          data: {
            slipId: randomUUID(),
            businessDate,
            transactionType: "CORRECTION",
            vesselId: original.vesselId,
            recordedById: adminId,
            approvedById: adminId, // 実行できるのは管理者のみのため実行者＝承認者
            departmentId: original.departmentId,
            siteId: original.siteId,
            shipId: original.shipId,
            itemTypeId: original.itemTypeId,
            quantity: fromCenti(reversalCenti),
            balanceAfter: fromCenti(nextCenti),
            referenceTransactionId: original.id,
            reason,
          },
        });

        await tx.vessel.update({
          where: { id: original.vesselId },
          data: { currentBalance: fromCenti(nextCenti) },
        });
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "訂正の記録に失敗しました" };
  }

  revalidatePath("/barges");
  revalidatePath("/history");
  revalidatePath("/admin/corrections");
  return { error: null, success: true };
}
