"use client";

// 一括保存フォーム共通の右下追従ボタン。form属性でフォームidに紐づけて送信する（管理画面の各ページで共通利用）。
// - position: fixed ではなく sticky を使う: iOS Safariはピンチズーム中のfixed要素のタップ判定が
//   見た目とずれて反応しなくなるため（管理画面はPC幅レイアウトでスマホでは常にズーム状態になる）。
//   stickyはフロー内配置なので、必ずページコンテンツの「最後の要素」として置くこと（途中に置くと追従しない）
// - クリック時はJSで form.requestSubmit() を直接呼ぶ: iOS Safariはform属性でフォーム外に置いた
//   ボタンのクリックからは送信が発火しないことがあるため、クリック経由の送信発火に依存しない。
//   JS無効時はtype=submit＋form属性のネイティブ送信がフォールバックとして残る
export function StickySaveButton({ formId, label = "変更を保存" }: { formId: string; label?: string }) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return; // 見つからなければネイティブ送信に任せる
    e.preventDefault();

    if (!form.checkValidity()) {
      // 閉じた<details>内の不正な入力はフォーカスできず送信が無言でブロックされるため、
      // 該当タンクのアコーディオンを開いてからブラウザの検証エラーを表示する
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
      form.reportValidity();
      return;
    }

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      // requestSubmit未対応の古いブラウザ: フォーム内に一時的なsubmitボタンを作って踏む
      const tmp = document.createElement("button");
      tmp.type = "submit";
      tmp.hidden = true;
      form.appendChild(tmp);
      tmp.click();
      tmp.remove();
    }
  }

  return (
    <div className="pointer-events-none sticky bottom-6 z-30 flex justify-end">
      <button
        form={formId}
        onClick={handleClick}
        className="pointer-events-auto rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white shadow-lg hover:bg-zinc-700 active:bg-zinc-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300"
      >
        {label}
      </button>
    </div>
  );
}
