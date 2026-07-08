// Prismaエラーの判定と、Neonコールドスタート対策の再試行ヘルパー

// 一意制約違反（P2002）か
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// P2002の対象インデックス/カラム名（エラーメッセージの出し分けに使う）
export function uniqueViolationTarget(e: unknown): string {
  const meta = (e as { meta?: { target?: string | string[] } }).meta;
  const target = meta?.target;
  return Array.isArray(target) ? target.join(",") : (target ?? "");
}

// Neonは休止からの復帰直後に接続確立やトランザクション開始が失敗しやすい。
// 「まだ何も実行されていない」ことが確実なエラーのみ再試行する:
//   P1001 = DBに到達できない / P2028 = トランザクションを開始できない
// ※「実行中に切断」系はコミット済みか不明で、台帳の二重記録を招くため再試行しない
const RETRYABLE_CODES = new Set(["P1001", "P2028"]);

export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (!RETRYABLE_CODES.has(code) || i === attempts - 1) throw e;
      lastError = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastError;
}
