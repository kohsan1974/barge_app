"use client";

import { useActionState, useRef } from "react";
import { changePassword, type ChangePasswordState } from "@/lib/actions/change-password";
import { FieldLabel, PrimaryButton, TextInput } from "@/components/ui";

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
        <FieldLabel>現在のパスワード</FieldLabel>
        <TextInput
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="w-full"
        />
      </div>
      <div>
        <FieldLabel>新しいパスワード（8文字以上）</FieldLabel>
        <TextInput
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full"
        />
      </div>
      <div>
        <FieldLabel>新しいパスワード（確認）</FieldLabel>
        <TextInput
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
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
          パスワードを変更しました。次回ログインから新しいパスワードを使用してください
        </p>
      )}

      <PrimaryButton type="submit" disabled={pending} className="w-full py-2 font-medium">
        {pending ? "変更中..." : "パスワードを変更する"}
      </PrimaryButton>
    </form>
  );
}
