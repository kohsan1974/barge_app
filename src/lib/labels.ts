// 台帳表示用の共有ラベル定義。
// 同じ対訳マップ・表記ロジックが画面ごとにコピーされていると、文言変更時に
// 直し漏れて画面間で表記が食い違うため、表示系ページはここを参照する。
// ※CSVエクスポート(ledger-export.ts)は提出済みファイルとの互換性維持のため
//   独自のラベル（CALIBRATION=「残量調整」）を持つ。安易に統合しないこと

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  RECEIVE: "搬入",
  PROCESS: "処理",
  CALIBRATION: "調整",
  CORRECTION: "訂正",
};

// タンクの表示名。「バージ名-タンク名」（バージ所属なしはタンク名のみ）の表記規則を一元化する
export function vesselLabel(vessel: { name: string; barge: { name: string } | null }): string {
  return vessel.barge ? `${vessel.barge.name}-${vessel.name}` : vessel.name;
}
