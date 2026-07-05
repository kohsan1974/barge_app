"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { recordTransaction, type RecordTransactionState } from "@/lib/actions/record-transaction";

type Department = { id: string; name: string; type: string };
type Site = { id: string; name: string; departmentId: string };
type Ship = { id: string; name: string };
type Content = { id: string; name: string; unit: string };
type VesselOption = { id: string; name: string; contents: Content[] };

const initialState: RecordTransactionState = { error: null };

export function RecordForm({
  departments,
  sites,
  ships,
  vessels,
}: {
  departments: Department[];
  sites: Site[];
  ships: Ship[];
  vessels: VesselOption[];
}) {
  const router = useRouter();

  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? "");

  const selectedVessel = vessels.find((v) => v.id === vesselId);
  const availableContents = useMemo(() => selectedVessel?.contents ?? [], [selectedVessel]);

  const [items, setItems] = useState<{ itemTypeId: string; quantity: string }[]>([
    { itemTypeId: vessels[0]?.contents[0]?.id ?? "", quantity: "" },
  ]);

  const [state, formAction, pending] = useActionState(
    async (prevState: RecordTransactionState, formData: FormData) => {
      const result = await recordTransaction(prevState, formData);
      if (result.success) {
        setItems([{ itemTypeId: availableContents[0]?.id ?? "", quantity: "" }]);
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  // toISOString()はUTC基準のため、日本時間の午前0時〜9時に「前日」が初期値になる。端末のローカル日付を使う
  const [businessDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  const selectedDepartment = departments.find((d) => d.id === departmentId);
  const isReceive = selectedDepartment?.type === "TRANSPORT";
  const filteredSites = useMemo(
    () => sites.filter((s) => s.departmentId === departmentId),
    [sites, departmentId],
  );

  function handleVesselChange(nextVesselId: string) {
    setVesselId(nextVesselId);
    // タンクごとに選べる内容物が異なるため、タンク変更時は品目行をリセットする
    const nextContents = vessels.find((v) => v.id === nextVesselId)?.contents ?? [];
    setItems([{ itemTypeId: nextContents[0]?.id ?? "", quantity: "" }]);
  }

  function addItemRow() {
    setItems((prev) => [...prev, { itemTypeId: availableContents[0]?.id ?? "", quantity: "" }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, patch: Partial<{ itemTypeId: string; quantity: string }>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const noContents = availableContents.length === 0;

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <label className="mb-1 block text-xs text-zinc-500">部署（ステータス）</label>
        {departments.length > 1 ? (
          <select
            name="departmentId"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}（{d.type === "TRANSPORT" ? "搬入" : "処理"}）
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="departmentId" value={departmentId} />
            <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {selectedDepartment?.name}（{isReceive ? "搬入" : "処理"}）
            </p>
          </>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">業務日</label>
        <input
          type="date"
          name="businessDate"
          defaultValue={businessDate}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">現場</label>
        <select
          name="siteId"
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          {filteredSites.length === 0 ? (
            <option value="">この部署に紐づく現場がありません</option>
          ) : (
            filteredSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))
          )}
        </select>
      </div>

      {isReceive && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">本船</label>
          <select
            name="shipId"
            required={isReceive}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {ships.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-zinc-500">タンク</label>
        <select
          name="vesselId"
          value={vesselId}
          onChange={(e) => handleVesselChange(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          {vessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-xs text-zinc-500">内容物・数量</label>
        {noContents ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            このタンクには内容物が登録されていません。管理者にタンクマスタでの内容物登録を依頼してください
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    name="itemTypeId"
                    value={item.itemTypeId}
                    onChange={(e) => updateItem(index, { itemTypeId: e.target.value })}
                    className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  >
                    {availableContents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="quantity"
                    step="0.1"
                    min="0.1"
                    required
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    placeholder="数量 (kL)"
                    className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(index)}
                      className="text-xs text-zinc-500 underline dark:text-zinc-400"
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItemRow}
              className="mt-2 text-xs text-blue-600 underline dark:text-blue-400"
            >
              + 内容物を追加
            </button>
          </>
        )}
      </div>

      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
          記録しました
        </p>
      )}

      <button
        type="submit"
        disabled={pending || noContents}
        className="w-full rounded bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "記録中..." : "記録する"}
      </button>
    </form>
  );
}
