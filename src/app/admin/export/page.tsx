import { prisma } from "@/lib/prisma";
import { isSheetsConfigured } from "@/lib/google-sheets";
import { runSheetsSync } from "@/lib/actions/sheets-sync";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ sheets?: string; rows?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const sheetsConfigured = isSheetsConfigured();

  const [vessels, history] = await Promise.all([
    prisma.vessel.findMany({ orderBy: { name: "asc" } }),
    prisma.exportHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { requestedBy: true },
    }),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="mb-2 text-base font-medium text-zinc-900 dark:text-zinc-50">
          台帳エクスポート（公的機関提出用）
        </h1>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          期間を指定して台帳をCSV（Excel対応）でダウンロードします。ファイルには改ざん検知用のSHA-256ハッシュが付与され、
          「いつ・誰が・どの範囲を」出力したかが下の履歴に記録されます。
        </p>
        <form
          action="/api/export"
          method="GET"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-xs text-zinc-500">開始日</label>
            <input
              type="date"
              name="from"
              required
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">終了日</label>
            <input
              type="date"
              name="to"
              required
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">タンク（任意）</label>
            <select
              name="vesselId"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="">すべて</option>
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            CSVをダウンロード
          </button>
          <a
            href="/api/export?all=1"
            className="text-xs text-zinc-500 underline dark:text-zinc-400"
          >
            全期間をダウンロード（バックアップ用）
          </a>
        </form>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Google Sheets連携（閲覧用ミラー・日次自動バックアップ）
        </h2>
        {params.sheets === "ok" && (
          <p className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
            スプレッドシートへ同期しました（台帳 {params.rows ?? "?"}件）
          </p>
        )}
        {params.sheets === "error" && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {params.detail ?? "同期に失敗しました"}
          </p>
        )}
        {params.sheets === "forbidden" && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            管理者権限が必要です
          </p>
        )}
        {sheetsConfigured ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              台帳全件とタンク残量を指定のスプレッドシートに書き出します（シート側は常にDBの写しです。
              シートを直接編集してもDBには反映されません）。デプロイ後は毎日午前3時（日本時間）にも自動同期されます。
            </p>
            <form action={runSheetsSync}>
              <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
                今すぐスプレッドシートへ同期
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <p className="mb-2 font-medium">未設定です。有効にする手順：</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Google Cloud Console でプロジェクトを作成し「Google Sheets API」を有効化</li>
              <li>サービスアカウントを作成し、JSONキーをダウンロード</li>
              <li>出力先のスプレッドシートを作成し、サービスアカウントのメールアドレスに「編集者」で共有</li>
              <li>
                .env（本番はVercelの環境変数）に GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY /
                GOOGLE_SHEET_ID を設定して再起動
              </li>
            </ol>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">エクスポート履歴</h2>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">まだエクスポート履歴がありません。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2 font-medium">実行日時(JST)</th>
                  <th className="px-4 py-2 font-medium">期間</th>
                  <th className="px-4 py-2 font-medium">実行者</th>
                  <th className="px-4 py-2 font-medium">形式</th>
                  <th className="px-4 py-2 font-medium">ハッシュ(先頭12桁)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                      {h.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {h.periodStart.toISOString().slice(0, 10)} 〜 {h.periodEnd.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{h.requestedBy.displayName}</td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{h.format}</td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-500">{h.fileHash?.slice(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
