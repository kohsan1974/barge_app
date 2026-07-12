import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TRANSACTION_TYPE_LABELS, vesselLabel } from "@/lib/labels";
import { CorrectionForm } from "./correction-form";

// 誤記録の訂正（逆仕訳）。台帳は追記専用のため、元の行を消すのではなく
// 打ち消し行を追加して相殺する。対象を選ぶ一覧と、選択後の確認画面を兼ねる
export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const params = await searchParams;

  if (params.target) {
    const target = await prisma.tankTransaction.findUnique({
      where: { id: params.target },
      include: {
        vessel: { include: { barge: true } },
        itemType: true,
        department: true,
        site: true,
        ship: true,
        truck: true,
        recordedBy: true,
        corrections: { select: { id: true } },
      },
    });
    if (!target) {
      return (
        <p className="text-sm text-red-600 dark:text-red-400">対象の記録が見つかりません。</p>
      );
    }
    const quantity = Number(target.quantity);
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="mb-1 text-base font-medium text-zinc-900 dark:text-zinc-50">
            記録の訂正（逆仕訳）
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            元の記録は消さず、数量の符号を反転した「訂正」行を追記して打ち消します。
            訂正後、正しい値は通常の記録画面から入力してください。
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-medium text-zinc-500">訂正対象の記録</p>
          <dl className="space-y-1 text-zinc-700 dark:text-zinc-300">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-zinc-400">種別・日付</dt>
              <dd>
                {TRANSACTION_TYPE_LABELS[target.transactionType]} ／{" "}
                {target.businessDate.toISOString().slice(0, 10)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-zinc-400">タンク</dt>
              <dd>{vesselLabel(target.vessel)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-zinc-400">内容物・数量</dt>
              <dd>
                {target.itemType?.name ?? "—"} {quantity > 0 ? "+" : ""}
                {quantity.toFixed(2)}kL
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-zinc-400">現場・本船</dt>
              <dd>
                {target.site?.name ?? "—"}
                {target.ship ? ` ／ ${target.ship.name}` : ""}
                {target.truck ? ` ／ ${target.truck.name}` : ""}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-zinc-400">記録者</dt>
              <dd>{target.recordedBy.displayName}</dd>
            </div>
          </dl>
        </div>

        {target.corrections.length > 0 ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            この記録はすでに訂正済みです。
          </p>
        ) : target.transactionType === "CALIBRATION" || target.transactionType === "CORRECTION" ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            この種別の記録はここでは訂正できません（残量調整はキャリブレーションの再実行で補正します）。
          </p>
        ) : (
          <CorrectionForm targetId={target.id} />
        )}

        <Link
          href="/admin/corrections"
          className="inline-block text-xs text-zinc-500 underline dark:text-zinc-400"
        >
          ← 一覧に戻る
        </Link>
      </div>
    );
  }

  const transactions = await prisma.tankTransaction.findMany({
    where: { transactionType: { in: ["RECEIVE", "PROCESS"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      vessel: { include: { barge: true } },
      itemType: true,
      site: true,
      recordedBy: true,
      corrections: { select: { id: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-1 text-base font-medium text-zinc-900 dark:text-zinc-50">
          記録の訂正（逆仕訳）
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          誤って入力した搬入・処理の記録を打ち消します。元の記録は法的証跡として残り、
          打ち消し行（訂正）が追記されます。直近50件を表示しています。
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium whitespace-nowrap">業務日</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">種別</th>
              <th className="px-3 py-2 font-medium">タンク</th>
              <th className="px-3 py-2 font-medium">内容物・数量</th>
              <th className="px-3 py-2 font-medium">現場</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">記録者</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-400">
                  記録がありません
                </td>
              </tr>
            ) : (
              transactions.map((t) => {
                const quantity = Number(t.quantity);
                return (
                  <tr key={t.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {t.businessDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {TRANSACTION_TYPE_LABELS[t.transactionType]}
                    </td>
                    <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">
                      {vesselLabel(t.vessel)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {t.itemType?.name ?? "—"} {quantity > 0 ? "+" : ""}
                      {quantity.toFixed(1)}kL
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{t.site?.name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {t.recordedBy.displayName}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {t.corrections.length > 0 ? (
                        <span className="text-xs text-zinc-400">訂正済み</span>
                      ) : (
                        <Link
                          href={`/admin/corrections?target=${t.id}`}
                          className="text-xs text-red-600 underline dark:text-red-400"
                        >
                          訂正する
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
