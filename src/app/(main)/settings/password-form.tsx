"use client";

import { useActionState, useRef } from "react";
import { changePassword, type ChangePasswordState } from "@/lib/actions/change-password";

const initialState: ChangePasswordState = { error: null };

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ChangePasswordState, formData: FormData) => {
      const result = await changePassword(prev, formData);
      if (result.success) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <label className="mb-1 block text-xs text-zinc-500">現在のパスワード</label>
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">新しいパスワード（8文字以上）</label>
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">新しいパスワード（確認）</label>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
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
          パスワードを変更しました。次回ログインから新しいパスワードを使用してください
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "変更中..." : "パスワードを変更する"}
      </button>
    </form>
  );
}
