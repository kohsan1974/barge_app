"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAdminUserId } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-utils";
import { toCenti, fromCenti } from "@/lib/quantity";

// トランザクション内の業務エラーをリダイレクト先のエラーコードへ運ぶための例外
class VoidError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// 記録の取消（論理削除）。adminのみが「伝票（slip）単位」で実行する。
// 台帳の行は物理削除せず、取消3列（voidedAt/voidedById/voidReason）をセットして「消された」ことを表す。
// 取消済みの行は出力(CSV)・残量計算・集計から除外し、履歴では横線＋「削除しました」で表示する。
// 残量キャッシュ(currentBalance)は、取消行の数量ぶんを行ロック付きで巻き戻す。
export async function voidTransactionSlip(formData: FormData): Promise<void> {
  const adminId = await getAdminUserId();
  if (!adminId) redirect("/history?error=admin_required");

  const slipId = String(formData.get("slipId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!slipId) redirect("/history?error=not_found");
  // 法的証跡の一部（何を・なぜ消したか）を残すため、理由は必須
  if (!reason) redirect("/history?error=void_reason");

  try {
    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        // 取消対象＝この伝票の未取消行。訂正の有無も確認する
        const rows = await tx.tankTransaction.findMany({
          where: { slipId, voidedAt: null },
          select: {
            id: true,
            vesselId: true,
            quantity: true,
            transactionType: true,
            _count: { select: { corrections: true } },
          },
        });
        if (rows.length === 0) throw new VoidError("not_found");

        // 訂正・残量調整の行、および訂正済みの記録は取消の対象外（会計の二重処理を避ける）
        for (const r of rows) {
          if (r.transactionType === "CORRECTION" || r.transactionType === "CALIBRATION") {
            throw new VoidError("cannot_void_special");
          }
          if (r._count.corrections > 0) {
            throw new VoidError("already_corrected");
          }
        }

        // タンクごとに巻き戻す残量（＝取消行の数量の合計）を集計する
        const deltaByVessel = new Map<string, number>();
        for (const r of rows) {
          deltaByVessel.set(r.vesselId, (deltaByVessel.get(r.vesselId) ?? 0) + toCenti(String(r.quantity)));
        }

        // デッドロック回避のため対象タンクをid昇順でまとめてロックする
        const vesselIds = [...deltaByVessel.keys()].sort();
        const locked = await tx.$queryRaw<
          { id: string; currentBalance: string; maxCapacity: string }[]
        >`SELECT "id", "currentBalance", "maxCapacity" FROM "master_vessel" WHERE "id" = ANY(${vesselIds}) ORDER BY "id" ASC FOR UPDATE`;
        const byId = new Map(locked.map((v) => [v.id, v]));

        for (const [vesselId, deltaCenti] of deltaByVessel) {
          const v = byId.get(vesselId);
          if (!v) throw new VoidError("not_found");
          // 取消はその行の数量ぶんを打ち消すので、残量から数量を引く（RECEIVE(+)は減り、PROCESS(-)は増える）
          const nextCenti = toCenti(v.currentBalance) - deltaCenti;
          if (nextCenti < 0) throw new VoidError("would_negative");
          if (nextCenti > toCenti(v.maxCapacity)) throw new VoidError("would_exceed");
          await tx.vessel.update({ where: { id: vesselId }, data: { currentBalance: fromCenti(nextCenti) } });
        }

        // 取消3列をセット（追記専用トリガーはこの3列のみのUPDATEを許可する）
        await tx.tankTransaction.updateMany({
          where: { slipId, voidedAt: null },
          data: { voidedAt: new Date(), voidedById: adminId, voidReason: reason },
        });
      }),
    );
  } catch (e) {
    if (e instanceof VoidError) redirect(`/history?error=${e.code}`);
    throw e;
  }

  revalidatePath("/history");
  revalidatePath("/barges");
  revalidatePath("/record");
  revalidatePath("/admin/export");
  redirect("/history?ok=voided");
}
