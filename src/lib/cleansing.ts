// クレンジング規則
// サイト(現場)名：前後の空白のみトリムする
export function cleanseSiteName(value: string): string {
  return value.trim();
}

// オペレーター(作業者)名：文字列内の全角・半角スペースを完全に除去する
export function cleanseOperatorName(value: string): string {
  return value.replace(/[\s　]/g, "");
}
