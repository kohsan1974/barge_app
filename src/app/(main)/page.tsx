import { redirect } from "next/navigation";

// 現場の利用頻度が最も高い「登録」を初期画面にする。バージ残量一覧は /barges へ移動した
export default function Home() {
  redirect("/record");
}
