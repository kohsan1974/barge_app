"use client";

// 一括保存フォーム共通の右下追従の保存ボタン（管理画面の各ページで共通利用）。
// このコンポーネント自身が本物の<form>をレンダリングし、ボタンはその「内側」に置く:
// iOS Safariはform属性でフォーム外に置いたボタンのクリックから送信が発火しないことがあるため、
// JSにも依存しない最も確実なネイティブ送信経路（フォーム内のtype=submit）を使う。
// 各入力欄は従来どおりform属性でこのフォームidに紐づける（フォームの入れ子を避けるため）。
// - position: fixed ではなく sticky: iOS Safariはピンチズーム中のfixed要素のタップ判定が
//   見た目とずれるため。stickyはフロー内配置なので、必ずページの「最後の要素」として置くこと
export function StickySaveButton({
  formId,
  action,
  label = "変更を保存",
}: {
  formId: string;
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
}) {
  // 閉じた<details>内の入力が検証エラーだとフォーカスできず送信が無言で止まるため、
  // クリック時に該当アコーディオンを開いておく（送信自体はネイティブの流れに任せる）
  function openDetailsAroundInvalidFields(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    if (!form || form.checkValidity()) return;
    for (const el of Array.from(form.elements)) {
      const isField =
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement;
      if (isField && !el.checkValidity()) {
        let details = el.closest("details");
        while (details) {
          details.open = true;
          details = details.parentElement?.closest("details") ?? null;
        }
      }
    }
  }

  return (
    <form
      id={formId}
      action={action}
      className="pointer-events-none sticky bottom-6 z-30 flex justify-end"
    >
      <button
        type="submit"
        onClick={openDetailsAroundInvalidFields}
        className="pointer-events-auto rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white shadow-lg hover:bg-zinc-700 active:bg-zinc-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300"
      >
        {label}
      </button>
    </form>
  );
}
