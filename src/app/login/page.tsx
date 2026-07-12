"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FieldLabel, PrimaryButton, TextInput } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn("credentials", {
      loginId,
      password,
      redirect: false,
    });
    setSubmitting(false);
    if (result?.error) {
      setError("ログインIDまたはパスワードが正しくありません");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">受入・タンク管理システム</p>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          ログイン
        </h1>
        <div className="mb-4">
          {/* ログイン画面のみラベルを一回り大きく表示する（共有スタイルを上書き） */}
          <FieldLabel className="text-sm text-zinc-600 dark:text-zinc-400">ログインID</FieldLabel>
          <TextInput
            type="text"
            autoComplete="username"
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="mb-6">
          <FieldLabel className="text-sm text-zinc-600 dark:text-zinc-400">パスワード</FieldLabel>
          <TextInput
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full"
          />
        </div>
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <PrimaryButton type="submit" disabled={submitting} className="w-full py-2 font-medium">
          {submitting ? "ログイン中..." : "ログイン"}
        </PrimaryButton>
      </form>
    </div>
  );
}
