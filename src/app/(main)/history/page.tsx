import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isActiveAdmin } from "@/lib/require-admin";
import { TRANSACTION_TYPE_LABELS, vesselLabel } from "@/lib/labels";
import { voidTransactionSlip } from "@/lib/actions/void-record";
import { VoidRecordButton } from "@/components/admin-autosave";

const PER_PAGE = 50;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = userId ? await isActiveAdmin(userId) : false;

  const [transactions, total] = await Promise.all([
    prisma.tankTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
      include: {
        vessel: { include: { barge: true } },
        department: true,
        site: true,
        ship: true,
        truck: true,
        itemType: true,
        recordedBy: true,
        voidedBy: true,
        corrections: { select: { id: true } },
      },
    }),
    prisma.tankTransaction.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">記録履歴</h2>
        <span className="text-xs text-zinc-400">全{total}件</span>
      </div>
      {transactions.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ記録がありません。</p>
      ) : (
        <ul className="space-y-2">
          {transactions.map((t) => {
            const quantity = Number(t.quantity);
            const voided = t.voidedAt !== null;
            // 取消可能なのは、admin かつ 未取消の通常記録（搬入・処理）で、訂正されていないもの
            const canVoid =
              isAdmin &&
              !voided &&
              (t.transactionType === "RECEIVE" || t.transactionType === "PROCESS") &&
              t.corrections.length === 0;
            return (
              <li
                key={t.id}
                className={`rounded-lg border p-3 text-sm ${
                  voided
                    ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-medium ${
                      voided
                        ? "text-zinc-400 line-through dark:text-zinc-500"
                        : "text-zinc-900 dark:text-zinc-50"
                    }`}
                  >
                    {TRANSACTION_TYPE_LABELS[t.transactionType] ?? t.transactionType} ・{" "}
                    {vesselLabel(t.vessel)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {t.corrections.length > 0 && !voided && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        訂正済み
                      </span>
                    )}
                    {voided && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                        削除しました
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">{t.businessDate.toISOString().slice(0, 10)}</span>
                    {canVoid && <VoidRecordButton onVoid={voidTransactionSlip.bind(null, t.slipId)} />}
                  </span>
                </div>
                <div className={`mt-1 ${voided ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-400"}`}>
                  {t.transactionType === "CALIBRATION" ? (
                    <>
                      システム値 {Number(t.systemValueBefore).toFixed(2)}kL → 実測{" "}
                      {Number(t.measuredValue).toFixed(2)}kL（差 {quantity >= 0 ? "+" : ""}
                      {quantity.toFixed(2)}kL）
                    </>
                  ) : (
                    <>
                      {t.itemType?.name ?? "（品目なし）"} {quantity > 0 ? "+" : ""}
                      {quantity.toFixed(1)}
                      {t.itemType?.unit ?? "kL"}（残 {Number(t.balanceAfter).toFixed(1)}
                      {t.itemType?.unit ?? "kL"}）
                    </>
                  )}
                </div>
                {t.reason && (
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">理由: {t.reason}</div>
                )}
                <div className="mt-1 text-xs text-zinc-400">
                  {t.department?.name ?? "管理者操作"}
                  {t.site ? ` / ${t.site.name}` : ""}
                  {t.ship ? ` / ${t.ship.name}` : ""}
                  {t.truck ? ` / ${t.truck.name}` : ""}
                  ・記録者: {t.recordedBy.displayName}
                </div>
                {voided && (
                  <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
                    削除: {t.voidedBy?.displayName ?? "管理者"}（{t.voidedAt!.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）
                    {t.voidReason ? ` ／ 理由: ${t.voidReason}` : ""}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/history?page=${page - 1}`}
              className="rounded border border-zinc-300 px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              ← 新しい記録
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-zinc-400">
            {page} / {totalPages} ページ
          </span>
          {page < totalPages ? (
            <Link
              href={`/history?page=${page + 1}`}
              className="rounded border border-zinc-300 px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              古い記録 →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
