import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { twMerge } from "tailwind-merge";

// フォーム入力・ボタンの見た目を一元化する共有UIプリミティブ。
// 同じTailwindクラス文字列が全画面にコピーされていた状態を解消し、
// スタイル変更を1箇所で済むようにする。
// classNameはtailwind-mergeで後勝ちマージされるため、呼び出し側は
// 幅（w-20等）やパディング（py-1等）だけを上書きすればよい。
// フックを使わないためServer Componentからもそのまま使える。

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={twMerge("mb-1 block text-xs text-zinc-500", className)} />;
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={twMerge(
        "rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50",
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={twMerge(
        "rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={twMerge(
        "rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50",
        className,
      )}
    />
  );
}

// 黒背景の主ボタン（保存・追加・記録など）
export function PrimaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={twMerge(
        "rounded bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900",
        className,
      )}
    />
  );
}

// 下線リンク風のアクションボタン（保存・削除・無効化など）。toneで用途を出し分ける
const ACTION_TONES = {
  blue: "text-blue-600 dark:text-blue-400",
  red: "text-red-600 dark:text-red-400",
  zinc: "text-zinc-500 dark:text-zinc-400",
} as const;

export function ActionButton({
  tone = "zinc",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof ACTION_TONES }) {
  return (
    <button {...props} className={twMerge(`text-xs underline ${ACTION_TONES[tone]}`, className)} />
  );
}
