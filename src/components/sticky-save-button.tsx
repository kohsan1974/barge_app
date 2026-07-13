// 一括保存フォーム共通の右下追従ボタン。form属性でフォームidに紐づけて送信する（管理画面の各ページで共通利用）。
// position: fixed ではなく sticky を使う: iOS Safariはピンチズーム中のfixed要素のタップ判定が
// 見た目とずれて反応しなくなるため（管理画面はPC幅レイアウトでスマホでは常にズーム状態になる）。
// stickyはフロー内配置なので、必ずページコンテンツの「最後の要素」として置くこと（途中に置くと追従しない）
export function StickySaveButton({ formId, label = "変更を保存" }: { formId: string; label?: string }) {
  return (
    <div className="pointer-events-none sticky bottom-6 z-30 flex justify-end">
      <button
        form={formId}
        className="pointer-events-auto rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white shadow-lg hover:bg-zinc-700 active:bg-zinc-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300"
      >
        {label}
      </button>
    </div>
  );
}
