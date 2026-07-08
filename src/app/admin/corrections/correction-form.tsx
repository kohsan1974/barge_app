"use client";

import { useActionState, useState } from "react";
import { createCorrection, type CorrectionState } from "@/lib/actions/corrections";

const initialState: CorrectionState = { error: null };

export function CorrectionForm({ targetId }: { targetId: string }) {
  const [state, formAction, pending] = useActionState(createCorrection, initialState);
  // toISOString()はUTC基準で日本の深夜〜午前9時に前日になるため、端末のローカル日付を使う
  const [businessDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  if (state.success) {
    return (
      <div className="rounded bg-green-50 px-3 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
        訂正（逆仕訳）を記録しました。正しい値は記録画面から通常どおり入力してください。
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="targetId" value={targetId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">訂正日（業務日）</label>
        <input
          type="date"
          name="businessDate"
          defaultValue={businessDate}
          required
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">訂正理由（必須・監査記録に残ります）</label>
        <input
          name="reason"
          required
          placeholder="例：数量の入力誤り（正しくは12.5kL）"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "記録中..." : "この記録を打ち消す（逆仕訳を記録）"}
      </button>
    </form>
  );
}
