import { redirect } from "next/navigation";

// バージ管理はタンクと統合した「バージ・タンクマスタ」(/admin/vessels)に移動した
export default function BargesPage() {
  redirect("/admin/vessels");
}
