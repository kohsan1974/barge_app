import { redirect } from "next/navigation";

// 「記録の訂正（逆仕訳）」は廃止し、記録の「取消（論理削除）」に一本化した。
// 取消は履歴画面（/history）で管理者が行う。旧URLのブックマーク対策としてリダイレクトする
export default function CorrectionsPage() {
  redirect("/history");
}
