// quantity.ts / business-date.ts の単体テスト（npx tsx で実行）
import { toCenti, fromCenti } from "../src/lib/quantity";
import { validateBusinessDate, todayJst } from "../src/lib/business-date";

let failed = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = Object.is(actual, expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: got ${String(actual)}, want ${String(expected)}`);
}

// --- toCenti / fromCenti ---
eq("toCenti(0.1)", toCenti(0.1), 10);
eq("toCenti(76.5)", toCenti(76.5), 7650);
eq("toCenti('76.5')", toCenti("76.5"), 7650);
eq("toCenti(0.1+0.2 の合成誤差)", toCenti(0.30000000000000004), 30);
eq("toCenti(76.55)", toCenti(76.55), 7655);
eq("toCenti(NaN)", Number.isNaN(toCenti(NaN)), true);
eq("toCenti('abc')", Number.isNaN(toCenti("abc")), true);
eq("fromCenti(7650)", fromCenti(7650), 76.5);
eq("fromCenti(-30)", fromCenti(-30), -0.3);
// 台帳のシナリオ: 0.1 を3回搬入して 0.3、容量0.3ちょうどで超過しない
let bal = toCenti(0);
for (let i = 0; i < 3; i++) bal += toCenti(0.1);
eq("0.1×3回の残量(センチ)", bal, 30);
eq("容量0.3ちょうどで超過しない", bal > toCenti(0.3), false);
// float直計算だと 0.1*3 > 0.3 が true になる(誤検知)ことの対照実験
eq("(対照)floatでは誤検知する", 0.1 + 0.1 + 0.1 > 0.3, true);

// --- validateBusinessDate ---
const today = todayJst();
eq("今日はOK", validateBusinessDate(today).error, undefined);
eq("形式不正", validateBusinessDate("2026/07/06").error, "業務日が正しくありません");
eq("空文字", validateBusinessDate("").error, "業務日が正しくありません");
const future = new Date(`${today}T00:00:00Z`);
future.setUTCDate(future.getUTCDate() + 1);
eq("明日はNG", validateBusinessDate(future.toISOString().slice(0, 10)).error, "未来の日付は記録できません");
const past370 = new Date(`${today}T00:00:00Z`);
past370.setUTCDate(past370.getUTCDate() - 370);
eq(
  "370日前はNG",
  validateBusinessDate(past370.toISOString().slice(0, 10)).error?.startsWith("1年より前"),
  true,
);
const past300 = new Date(`${today}T00:00:00Z`);
past300.setUTCDate(past300.getUTCDate() - 300);
eq("300日前はOK", validateBusinessDate(past300.toISOString().slice(0, 10)).error, undefined);
eq("存在しない日付(2月30日)", validateBusinessDate("2026-02-30").error !== undefined, true);
const okDate = validateBusinessDate(today).date;
eq("dateはUTC深夜のDate", okDate?.toISOString().slice(0, 10), today);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
