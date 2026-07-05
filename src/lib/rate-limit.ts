// ログイン試行のレート制限（インメモリ方式）。
// サーバーレス環境ではインスタンスごとに独立してカウントされる制約があるが、
// 単一インスタンス内での総当たり攻撃を確実に遅延させる。外部ストア不要で無料枠と相性が良い。

const WINDOW_MS = 15 * 60 * 1000; // 15分
const MAX_FAILURES = 5;

const failures = new Map<string, number[]>();

function prune(key: string): number[] {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list;
}

export function isRateLimited(key: string): boolean {
  return prune(key).length >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const list = prune(key);
  list.push(Date.now());
  failures.set(key, list);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
