// 業務日の検証。
// 未来日や極端に古い日付の記録を防ぎ、台帳の時系列（残量スナップショットの並び）の信頼性を守る。
// 日付の比較は "YYYY-MM-DD" 文字列の辞書順で行い、Date⇄タイムゾーン変換の罠を避ける。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAST_LIMIT_DAYS = 366; // 遡及記録は1年まで許可（棚卸や監査対応での過去入力を想定）

// 日本時間での今日を "YYYY-MM-DD" で返す（sv-SEロケールはISO形式で出力される）
export function todayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// 端末のローカル日付を "YYYY-MM-DD" で返す（クライアントフォームの業務日初期値用）。
// toISOString()はUTC基準のため、日本時間の午前0時〜9時に「前日」が初期値になる問題を避ける。
// ※サーバー側の検証はtodayJst（JST固定）、こちらは端末設定に従う初期値。
//   各フォームにコピーされていた同一実装をここに一元化した
export function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function validateBusinessDate(raw: string): { date?: Date; error?: string } {
  if (!DATE_RE.test(raw)) {
    return { error: "業務日が正しくありません" };
  }
  const date = new Date(raw);
  // JSのDateは "2026-02-30" のような存在しない日付を3月2日へ繰り上げてしまうため、
  // 復元した文字列が入力と一致することまで確認する
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    return { error: "業務日が正しくありません" };
  }

  const today = todayJst();
  if (raw > today) {
    return { error: "未来の日付は記録できません" };
  }

  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - PAST_LIMIT_DAYS);
  const limitStr = limit.toISOString().slice(0, 10);
  if (raw < limitStr) {
    return { error: "1年より前の日付は記録できません（遡及が必要な場合は管理者に相談してください）" };
  }

  return { date };
}
