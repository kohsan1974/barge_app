// 一括保存フォーム共通の右下固定ボタン。フォーム本体との位置関係を問わず
// form属性でフォームidに紐づけて送信する（管理画面の各ページで共通利用）
export function StickySaveButton({ formId, label = "変更を保存" }: { formId: string; label?: string }) {
  return (
    <button
      form={formId}
      className="fixed right-6 bottom-6 z-30 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white shadow-lg hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {label}
    </button>
  );
}
