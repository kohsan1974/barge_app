import { prisma } from "@/lib/prisma";
import { createBarge, updateBarge, deleteBarge } from "@/lib/actions/barges";

const errorMessages: Record<string, string> = {
  has_vessels: "所属タンクが残っているバージは削除できません（先にタンクマスタで所属を変更してください）",
};

export default async function BargesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : null;

  const barges = await prisma.barge.findMany({
    orderBy: { name: "asc" },
    include: { vessels: { orderBy: { name: "asc" } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          バージマスタ
        </h1>
        {errorMessage && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          バージにタンクを所属させると、バージ残量一覧でグループ表示されます（所属はタンクマスタで設定）。
          表示方法は「内訳表示（タンクごとにツリー表示）」と「合計のみ表示」から選べます。
        </p>
        <form
          action={createBarge}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-xs text-zinc-500">バージ名</label>
            <input
              name="name"
              required
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">残量一覧での表示方法</label>
            <select
              name="displayMode"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="INDIVIDUAL">内訳表示（タンクごと）</option>
              <option value="TOTAL">合計のみ表示</option>
            </select>
          </div>
          <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            追加
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">バージ名 / 表示方法</th>
              <th className="px-4 py-2 font-medium">所属タンク</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {barges.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-zinc-400">
                  まだバージが登録されていません
                </td>
              </tr>
            ) : (
              barges.map((b) => (
                <tr key={b.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-3">
                    <form action={updateBarge} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={b.id} />
                      <input
                        name="name"
                        defaultValue={b.name}
                        className="w-32 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                      />
                      <select
                        name="displayMode"
                        defaultValue={b.displayMode}
                        className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                      >
                        <option value="INDIVIDUAL">内訳表示（タンクごと）</option>
                        <option value="TOTAL">合計のみ表示</option>
                      </select>
                      <button className="text-xs text-blue-600 underline dark:text-blue-400">保存</button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {b.vessels.length === 0 ? (
                      <span className="text-zinc-400">なし</span>
                    ) : (
                      b.vessels.map((v) => v.name).join("、")
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteBarge}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-xs text-zinc-500 underline dark:text-zinc-400">
                        削除
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
