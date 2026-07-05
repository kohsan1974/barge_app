import { prisma } from "@/lib/prisma";

const typeLabel: Record<string, string> = {
  RECEIVE: "搬入",
  PROCESS: "処理",
  CALIBRATION: "調整",
  CORRECTION: "訂正",
};

export default async function HistoryPage() {
  const transactions = await prisma.tankTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      vessel: { include: { barge: true } },
      department: true,
      site: true,
      ship: true,
      itemType: true,
      recordedBy: true,
    },
  });

  return (
    <div>
      <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">記録履歴</h2>
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
                    {t.vessel.barge ? `${t.vessel.barge.name}／${t.vessel.name}` : t.vessel.name}
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
                  ・記録者: {t.recordedBy.displayName}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
