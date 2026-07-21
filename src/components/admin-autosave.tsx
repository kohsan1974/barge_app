"use client";

// 管理画面の「都度保存（オートセーブ）」用クライアント部品。
// 各コントロールの変更時にサーバーアクションを直接呼び、結果を小さなステータス表示で返す。
// サーバーアクションは <form> 送信ではなく「バインド済み関数の直接呼び出し」で起動するため、
// iOS Safariのフォーム送信まわりの不具合（フォーム外submitterが発火しない等）を一切踏まない。

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";
import { TextInput, Select } from "@/components/ui";

export type SaveResult = { ok: true } | { ok: false; error: string };
type SaveStatus = "idle" | "saving" | "saved" | "error";

// 保存状態の小さなインジケータ表示
function StatusMark({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "saving") return <span className="text-xs text-zinc-400">保存中…</span>;
  if (status === "saved") return <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ 保存</span>;
  if (status === "error") return <span className="text-xs text-red-600 dark:text-red-400">⚠ {error}</span>;
  return null;
}

// 保存の実行とステータス管理を共通化するフック
function useSaver() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function run(fn: () => Promise<SaveResult>, onError?: () => void) {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setStatus("saved");
          timer.current = setTimeout(() => setStatus("idle"), 2000);
        } else {
          setStatus("error");
          setError(res.error);
          onError?.();
        }
      } catch {
        setStatus("error");
        setError("保存に失敗しました（通信エラー）");
        onError?.();
      }
    });
  }
  return { status, error, run };
}

// 文字/数値入力欄。入力欄を離れた時（blur）に、値が変わっていれば自動保存する
export function AutoText({
  initialValue,
  onSave,
  className,
  ...rest
}: {
  initialValue: string;
  onSave: (value: string) => Promise<SaveResult>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onBlur" | "defaultValue">) {
  const { status, error, run } = useSaver();
  const lastSaved = useRef(initialValue);
  const [value, setValue] = useState(initialValue);

  function handleBlur() {
    if (value === lastSaved.current) return; // 変更なしは保存しない
    run(
      async () => {
        const res = await onSave(value);
        if (res.ok) lastSaved.current = value;
        return res;
      },
      // 失敗時は最後に保存できた値へ戻す（中途半端な表示を残さない）
      () => setValue(lastSaved.current),
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <TextInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        className={className}
        {...rest}
      />
      <StatusMark status={status} error={error} />
    </span>
  );
}

// チェックボックス。切り替えた瞬間に自動保存する
export function AutoCheckbox({
  initialChecked,
  onSave,
  label,
  className,
}: {
  initialChecked: boolean;
  onSave: (checked: boolean) => Promise<SaveResult>;
  label: React.ReactNode;
  className?: string;
}) {
  const { status, error, run } = useSaver();
  const [checked, setChecked] = useState(initialChecked);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setChecked(next);
    run(
      () => onSave(next),
      () => setChecked(!next), // 失敗時は元に戻す
    );
  }

  return (
    <label className={twMerge("flex items-center gap-1", className)}>
      <input type="checkbox" checked={checked} onChange={handleChange} />
      {label}
      <StatusMark status={status} error={error} />
    </label>
  );
}

// セレクト。選択が変わった瞬間に自動保存する
export function AutoSelect({
  initialValue,
  onSave,
  children,
  className,
}: {
  initialValue: string;
  onSave: (value: string) => Promise<SaveResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const { status, error, run } = useSaver();
  const lastSaved = useRef(initialValue);
  const [value, setValue] = useState(initialValue);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    run(
      async () => {
        const res = await onSave(next);
        if (res.ok) lastSaved.current = next;
        return res;
      },
      () => setValue(lastSaved.current),
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Select value={value} onChange={handleChange} className={className}>
        {children}
      </Select>
      <StatusMark status={status} error={error} />
    </span>
  );
}

// バージ・タンク画面の「所属部署＋受入/搬出」の1部署ぶんの行。
// 3つのチェックボックス（所属・受入・搬出）はどれを変えても一緒に保存する。
// 所属をオフにすると受入/搬出は無効表示にする（リンクが無ければ役割は意味を持たないため）。
// 受入=このタンクに入れられる（allowReceiving）、搬出=このタンクから出せる（allowSourcing＝シフト元・放流・出荷の対象）
export function VesselDeptRow({
  deptName,
  initialLinked,
  initialReceiving,
  initialSourcing,
  onSave,
}: {
  deptName: string;
  initialLinked: boolean;
  initialReceiving: boolean;
  initialSourcing: boolean;
  onSave: (linked: boolean, allowReceiving: boolean, allowSourcing: boolean) => Promise<SaveResult>;
}) {
  const { status, error, run } = useSaver();
  const [linked, setLinked] = useState(initialLinked);
  const [receiving, setReceiving] = useState(initialReceiving);
  const [sourcing, setSourcing] = useState(initialSourcing);

  function save(nextLinked: boolean, nextReceiving: boolean, nextSourcing: boolean) {
    const prev = { linked, receiving, sourcing };
    setLinked(nextLinked);
    setReceiving(nextReceiving);
    setSourcing(nextSourcing);
    run(
      () => onSave(nextLinked, nextReceiving, nextSourcing),
      () => {
        setLinked(prev.linked);
        setReceiving(prev.receiving);
        setSourcing(prev.sourcing);
      },
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700">
      <label className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
        <input type="checkbox" checked={linked} onChange={(e) => save(e.target.checked, receiving, sourcing)} />
        {deptName}
      </label>
      <label className="flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
        <input
          type="checkbox"
          checked={receiving}
          disabled={!linked}
          onChange={(e) => save(linked, e.target.checked, sourcing)}
        />
        受入
      </label>
      <label className="flex items-center gap-0.5 text-sky-700 dark:text-sky-400">
        <input
          type="checkbox"
          checked={sourcing}
          disabled={!linked}
          onChange={(e) => save(linked, receiving, e.target.checked)}
        />
        搬出
      </label>
      <StatusMark status={status} error={error} />
    </span>
  );
}

// 記録の取消（論理削除）ボタン。押すと画面内に理由入力欄を出し、確定でサーバーアクションを
// 「直接呼び出し」で実行する（window.promptもネイティブ<form>送信も使わない＝iOSでも確実に動く）。
// 取消は伝票(slip)単位。理由は法的証跡として必須。
export function VoidRecordButton({
  onVoid,
  label = "取消",
}: {
  onVoid: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setOpen(false);
    setReason("");
    setError(null);
  }

  function submit() {
    if (!reason.trim()) {
      setError("理由を入力してください");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await onVoid(reason.trim());
        if (res.ok) {
          cancel();
          router.refresh(); // 取消結果（横線・残量）を反映
        } else {
          setError(res.error);
        }
      } catch {
        setError("取消に失敗しました（通信エラー）");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-red-600 underline dark:text-red-400"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1">
        <TextInput
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="取消理由（必須）"
          autoFocus
          className="w-40 px-2 py-0.5 text-xs"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded bg-red-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
        >
          {pending ? "取消中…" : "確定"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="text-xs text-zinc-500 underline dark:text-zinc-400"
        >
          キャンセル
        </button>
      </span>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}

// 削除など不可逆操作のボタン。押すとブラウザ標準の確認ダイアログを出し、
// OKのときだけネイティブ<form>送信で実行する（誤操作防止）
export function ConfirmButton({
  confirmText,
  className,
  children,
  ...rest
}: {
  confirmText: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmText)) e.preventDefault();
  }
  return (
    <button
      {...rest}
      onClick={handleClick}
      className={twMerge("text-xs text-red-600 underline dark:text-red-400", className)}
    >
      {children}
    </button>
  );
}
