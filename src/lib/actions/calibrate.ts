"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdminUserId } from "@/lib/require-admin";

export type CalibrateState = {
  error: string | null;
  success?: boolean;
  newBalance?: number;
};

export async function calibrateVessel(
  _prevState: CalibrateState,
  formData: FormData,
): Promise<CalibrateState> {
  const adminId = await getAdminUserId();
  if (!adminId) return { error: "管理者権限が必要です" };

  const vesselId = String(formData.get("vesselId") ?? "");
  const measuredRaw = Number(formData.get("measuredValue"));
  const reason = String(formData.get("reason") ?? "").trim();
  const businessDateRaw = String(formData.get("businessDate") ?? "");

  if (!vesselId) return { error: "タンクを選択してください" };
  if (!Number.isFinite(measuredRaw) || measuredRaw < 0) {
    return { error: "実測値は0以上の数値を入力してください" };
  }
  // 残量調整は監査上重い操作のため、理由の記入を必須とする
  if (!reason) return { error: "調整理由は必須です（例：月次棚卸で実測、検尺誤差の補正 等）" };

  const businessDate = businessDateRaw ? new Date(businessDateRaw) : new Date();
  if (Number.isNaN(businessDate.getTime())) return { error: "業務日が正しくありません" };

  const measured = Math.round(measuredRaw * 100) / 100;
  let newBalance = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // 記録中の同時更新を防ぐため行ロックを取得
      const locked = await tx.$queryRaw<
        { id: string; currentBalance: string; maxCapacity: string }[]
      >`SELECT "id", "currentBalance", "maxCapacity" FROM "master_vessel" WHERE "id" = ${vesselId} FOR UPDATE`;
      const vessel = locked[0];
      if (!vessel) throw new Error("タンクが見つかりません");

      const systemBefore = Number(vessel.currentBalance);
      const maxCapacity = Number(vessel.maxCapacity);
      if (measured > maxCapacity) {
        throw new Error(
          `実測値がタンクの最大容量(${maxCapacity}kL)を超えています。容量設定が誤っている場合は先にタンクマスタを修正してください`,
        );
      }

      const diff = Math.round((measured - systemBefore) * 100) / 100;

      await tx.tankTransaction.create({
        data: {
          slipId: randomUUID(),
          businessDate,
          transactionType: "CALIBRATION",
          vesselId,
          recordedById: adminId,
          approvedById: adminId, // 実行できるのは管理者のみのため実行者＝承認者
          // departmentId / itemTypeId は指定しない（キャリブレーションは部署・品目に紐づかない）
          quantity: diff, // 差分ゼロでも「確認した」という監査記録として残す
          balanceAfter: measured,
          measuredValue: measured,
          systemValueBefore: systemBefore,
          reason,
        },
      });

      await tx.vessel.update({ where: { id: vesselId }, data: { currentBalance: measured } });
      newBalance = measured;
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "調整の記録に失敗しました" };
  }

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/admin/calibration");
  return { error: null, success: true, newBalance };
}
