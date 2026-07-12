"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { calibrateVessel, type CalibrateState } from "@/lib/actions/calibrate";
import { todayLocalDate } from "@/lib/business-date";
import { FieldLabel, PrimaryButton, Select, Textarea, TextInput } from "@/components/ui";

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
  // 業務日の初期値は端末のローカル日付（実装と理由はtodayLocalDate参照）
  const [businessDate] = useState(todayLocalDate);

  if (vessels.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">稼働中のタンクがありません。</p>;
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <FieldLabel>タンク</FieldLabel>
        <Select
          name="vesselId"
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
          className="w-full"
        >
          {vessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}（システム値 {v.currentBalance.toFixed(2)} kL / 容量 {v.maxCapacity.toFixed(1)} kL）
            </option>
          ))}
        </Select>
      </div>

      <div>
        <FieldLabel>業務日（実測した日）</FieldLabel>
        <TextInput type="date" name="businessDate" defaultValue={businessDate} required className="w-full" />
      </div>

      <div>
        <FieldLabel>実測値 (kL)</FieldLabel>
        <TextInput
          type="number"
          name="measuredValue"
          step="0.01"
          min="0"
          required
          placeholder={selected ? `現在のシステム値: ${selected.currentBalance.toFixed(2)}` : ""}
          className="w-full"
        />
      </div>

      <div>
        <FieldLabel>調整理由（必須）</FieldLabel>
        <Textarea
          name="reason"
          required
          rows={2}
          placeholder="例：月次棚卸で検尺を実施、書類上の数量との乖離を補正"
          className="w-full"
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

      <PrimaryButton type="submit" disabled={pending} className="w-full py-2 font-medium">
        {pending ? "記録中..." : "調整を記録する"}
      </PrimaryButton>
    </form>
  );
}
