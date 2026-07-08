import Link from "next/link";
import { prisma } from "@/lib/prisma";

const typeLabel: Record<string, string> = {
  RECEIVE: "搬入",
  PROCESS: "処理",
  CALIBRATION: "調整",
  CORRECTION: "訂正",
};

const PER_PAGE = 50;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

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
            return (
              <li
                key={t.id}
                className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {typeLabel[t.transactionType] ?? t.transactionType} ・{" "}
                    {t.vessel.barge ? `${t.vessel.barge.name}-${t.vessel.name}` : t.vessel.name}
                    {t.corrections.length > 0 && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        訂正済み
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {t.businessDate.toISOString().slice(0, 10)}
                  </span>
                </div>
                <div className="mt-1 text-zinc-600 dark:text-zinc-400">
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
