"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdminUserId } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-utils";
import { toCenti, fromCenti } from "@/lib/quantity";

export type VoidResult = { ok: true } | { ok: false; error: string };

// トランザクション内の業務エラーを呼び出し側の結果へ運ぶための例外（メッセージは日本語で保持）
class VoidError extends Error {}

// 記録の取消（論理削除）。adminのみが「伝票（slip）単位」で実行する。
// 台帳の行は物理削除せず、取消3列（voidedAt/voidedById/voidReason）をセットして「消された」ことを表す。
// 取消済みの行は出力(CSV)・残量計算・集計から除外し、履歴では横線＋「削除しました」で表示する。
// 残量キャッシュ(currentBalance)は、取消行の数量ぶんを行ロック付きで巻き戻す。
// クライアントから「直接呼び出し」で起動し、結果を返す（<form>送信に依存しない＝iOSのフォーム送信不具合を踏まない）。
export async function voidTransactionSlip(slipId: string, reason: string): Promise<VoidResult> {
  const adminId = await getAdminUserId();
  if (!adminId) return { ok: false, error: "取消は管理者のみ実行できます" };

  const trimmedReason = reason.trim();
  if (!slipId) return { ok: false, error: "対象の記録が見つかりません" };
  // 法的証跡の一部（何を・なぜ消したか）を残すため、理由は必須
  if (!trimmedReason) return { ok: false, error: "取消理由を入力してください" };

  try {
    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        // 取消対象＝この伝票の未取消行。訂正の有無も確認する
        const rows = await tx.tankTransaction.findMany({
          where: { slipId, voidedAt: null },
          select: {
            vesselId: true,
            quantity: true,
            transactionType: true,
            _count: { select: { corrections: true } },
          },
        });
        if (rows.length === 0) {
          throw new VoidError("対象の記録が見つかりません（すでに取消済みの可能性があります）");
        }

        // 訂正行（廃止済みの旧機能の履歴）と、訂正済みの記録は取消の対象外（会計の二重処理を避ける）。
        // 残量調整（CALIBRATION）は取消可能：その調整分（数量＝残量への寄与）を巻き戻す
        for (const r of rows) {
          if (r.transactionType === "CORRECTION") {
            throw new VoidError("訂正の記録は取消できません");
          }
          if (r._count.corrections > 0) {
            throw new VoidError("この記録は訂正済みのため取消できません");
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
          if (!v) throw new VoidError("対象のタンクが見つかりません");
          // 取消はその行の数量ぶんを打ち消すので、残量から数量を引く（RECEIVE(+)は減り、PROCESS(-)は増える）
          const nextCenti = toCenti(v.currentBalance) - deltaCenti;
          if (nextCenti < 0) {
            throw new VoidError("取り消すと残量がマイナスになります。この分はすでに処理済みの可能性があるため、残量調整で補正してください");
          }
          if (nextCenti > toCenti(v.maxCapacity)) {
            throw new VoidError("取り消すと残量が最大容量を超えます。残量調整で補正してください");
          }
          await tx.vessel.update({ where: { id: vesselId }, data: { currentBalance: fromCenti(nextCenti) } });
        }

        // 取消3列をセット（追記専用トリガーはこの3列のみのUPDATEを許可する）
        await tx.tankTransaction.updateMany({
          where: { slipId, voidedAt: null },
          data: { voidedAt: new Date(), voidedById: adminId, voidReason: trimmedReason },
        });
      }),
    );
  } catch (e) {
    if (e instanceof VoidError) return { ok: false, error: e.message };
    throw e;
  }

  revalidatePath("/history");
  revalidatePath("/barges");
  revalidatePath("/record");
  revalidatePath("/admin/export");
  return { ok: true };
}
