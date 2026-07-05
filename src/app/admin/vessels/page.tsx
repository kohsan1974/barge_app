import { prisma } from "@/lib/prisma";
import {
  createVessel,
  updateVessel,
  setVesselStatus,
  addVesselContent,
  removeVesselContent,
} from "@/lib/actions/vessels";

const errorMessages: Record<string, string> = {
  not_found: "対象のタンクが見つかりません",
  capacity_below_balance: "現在の残量より小さい最大容量には変更できません（先に処理で残量を減らしてください）",
};

export default async function VesselsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const [vessels, barges] = await Promise.all([
    prisma.vessel.findMany({
      orderBy: { name: "asc" },
      include: {
        barge: true,
        allowedContents: { include: { itemType: true }, orderBy: { itemType: { name: "asc" } } },
      },
    }),
    prisma.barge.findMany({ orderBy: { name: "asc" } }),
  ]);

  vessels.sort((a, b) =>
    `${a.barge?.name ?? ""}${a.name}`.localeCompare(`${b.barge?.name ?? ""}${b.name}`, "ja"),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          タンクマスタ
        </h1>
        {errorMessage && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          タンク名は「1」「2」など短い番号を推奨します（一覧ではバージの下に番号で表示されます）。
          現在量（残量）は台帳から自動計算されるため、ここでは編集できません。
        </p>
        <form
          action={createVessel}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-xs text-zinc-500">タンク名（番号）</label>
            <input
              name="name"
              required
              placeholder="例: 1"
              className="w-24 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">最大容量 (kL)</label>
            <input
              name="maxCapacity"
              type="number"
              step="0.1"
              min="0.1"
              required
              className="w-28 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">所属バージ</label>
            <select
              name="bargeId"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="">（所属なし）</option>
              {barges.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" name="showInList" defaultChecked />
            一覧に表示
          </label>
          <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            追加
          </button>
        </form>
      </div>

      <div className="space-y-3">
        {vessels.map((v) => (
          <div
            key={v.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <form action={updateVessel} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={v.id} />
                <input
                  name="name"
                  defaultValue={v.name}
                  className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
                <input
                  name="maxCapacity"
                  type="number"
                  step="0.1"
                  defaultValue={Number(v.maxCapacity)}
                  className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
                <select
                  name="bargeId"
                  defaultValue={v.bargeId ?? ""}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <option value="">（所属なし）</option>
                  {barges.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <input type="checkbox" name="showInList" defaultChecked={v.showInList} />
                  一覧に表示
                </label>
                <button className="text-xs text-blue-600 underline dark:text-blue-400">保存</button>
              </form>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-zinc-500">現在量 {Number(v.currentBalance).toFixed(1)} kL</span>
                {v.status === "ACTIVE" ? (
                  <span className="text-green-700 dark:text-green-400">稼働中</span>
                ) : (
                  <span className="text-zinc-400">廃止済み</span>
                )}
                <form action={setVesselStatus}>
                  <input type="hidden" name="id" value={v.id} />
                  <input
                    type="hidden"
                    name="nextStatus"
                    value={v.status === "ACTIVE" ? "DECOMMISSIONED" : "ACTIVE"}
                  />
                  <button className="text-zinc-500 underline dark:text-zinc-400">
                    {v.status === "ACTIVE" ? "廃止する" : "再稼働する"}
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <span className="text-xs text-zinc-500">入れられる内容物:</span>
              {v.allowedContents.length === 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  未登録（登録がないと記録画面でこのタンクを選べません）
                </span>
              )}
              {v.allowedContents.map((link) => (
                <form key={link.id} action={removeVesselContent} className="inline-flex">
                  <input type="hidden" name="vesselId" value={v.id} />
                  <input type="hidden" name="itemTypeId" value={link.itemTypeId} />
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pr-1 pl-2.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {link.itemType.name}
                    <button
                      className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700"
                      aria-label={`${link.itemType.name}を解除`}
                    >
                      ×
                    </button>
                  </span>
                </form>
              ))}
              <form action={addVesselContent} className="inline-flex items-center gap-1">
                <input type="hidden" name="vesselId" value={v.id} />
                <input
                  name="contentName"
                  required
                  placeholder="内容物名（例: ビルジ）"
                  className="w-36 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
                <button className="text-xs text-blue-600 underline dark:text-blue-400">追加</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
