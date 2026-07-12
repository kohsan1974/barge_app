"use client";

import { useActionState, useState } from "react";
import { createCorrection, type CorrectionState } from "@/lib/actions/corrections";
import { todayLocalDate } from "@/lib/business-date";
import { FieldLabel, TextInput } from "@/components/ui";

const initialState: CorrectionState = { error: null };

export function CorrectionForm({ targetId }: { targetId: string }) {
  const [state, formAction, pending] = useActionState(createCorrection, initialState);
  // 業務日の初期値は端末のローカル日付（実装と理由はtodayLocalDate参照）
  const [businessDate] = useState(todayLocalDate);

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
        <FieldLabel>訂正日（業務日）</FieldLabel>
        <TextInput type="date" name="businessDate" defaultValue={businessDate} required />
      </div>
      <div>
        <FieldLabel>訂正理由（必須・監査記録に残ります）</FieldLabel>
        <TextInput
          name="reason"
          required
          placeholder="例：数量の入力誤り（正しくは12.5kL）"
          className="w-full"
        />
      </div>
      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}
      {/* 台帳を打ち消す操作のため、通常の主ボタンではなく赤で警告する */}
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
