"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { calibrateVessel, type CalibrateState } from "@/lib/actions/calibrate";

type VesselOption = { id: string; name: string; currentBalance: number; maxCapacity: number };

const initialState: CalibrateState = { error: null };

export function CalibrationForm({ vessels }: { vessels: VesselOption[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: CalibrateState, formData: FormData) => {
      const result = await calibrateVessel(prev, formData);
      if (result.success) router.refresh();
      return result;
    },
    initialState,
  );

  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? "");
  const selected = vessels.find((v) => v.id === vesselId);
  const [businessDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  if (vessels.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">稼働中のタンクがありません。</p>;
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <label className="mb-1 block text-xs text-zinc-500">タンク</label>
        <select
          name="vesselId"
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          {vessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}（システム値 {v.currentBalance.toFixed(2)} kL / 容量 {v.maxCapacity.toFixed(1)} kL）
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">業務日（実測した日）</label>
        <input
          type="date"
          name="businessDate"
          defaultValue={businessDate}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">実測値 (kL)</label>
        <input
          type="number"
          name="measuredValue"
          step="0.01"
          min="0"
          required
          placeholder={selected ? `現在のシステム値: ${selected.currentBalance.toFixed(2)}` : ""}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">調整理由（必須）</label>
        <textarea
          name="reason"
          required
          rows={2}
          placeholder="例：月次棚卸で検尺を実施、書類上の数量との乖離を補正"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
          調整を記録しました（新しい残量: {state.newBalance?.toFixed(2)} kL）
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "記録中..." : "調整を記録する"}
      </button>
    </form>
  );
}
