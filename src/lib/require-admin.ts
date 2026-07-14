import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-utils";

// JWTのroleだけを信用せず、毎回DBで現在の権限と有効状態を確認する。
// これにより「無効化済みユーザーの残存セッション」「降格後の古いトークン」での管理操作を防ぐ。
// 判定の実体はisActiveAdminに一元化し、レイアウトの表示判定も含め全箇所で同じ基準を使う

// Neonの接続プーリングの性質上、直前の書き込み直後は別接続から見ると反映前の状態が
// 一瞬読めてしまうことがある（withDbRetryが対象とする接続断エラーとは別物で、
// クエリ自体は成功するが結果が古い）。有効な管理者が誤って「権限なし」と判定され
// 保存が丸ごと失敗する事故が実際に発生したため、falseが返った場合は短い間隔で数回読み直す。
// 本当に管理者でない場合は結果が変わらずfalseのまま返るだけなので、正当な拒否には
// 数百ms〜数秒の遅延が乗るだけで安全側に倒れる
async function queryIsActiveAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  return !!user?.isActive && user.role === "ADMIN";
}

// 指定ユーザーが「現在有効な管理者」かをDBの現在値で判定する
export async function isActiveAdmin(userId: string): Promise<boolean> {
  const delaysMs = [0, 300, 800, 1500];
  for (let i = 0; i < delaysMs.length; i++) {
    if (delaysMs[i] > 0) await new Promise((r) => setTimeout(r, delaysMs[i]));
    // 接続断（P1001/P2028）はwithDbRetryが再試行し、それ以外の例外はそのまま投げる
    if (await withDbRetry(() => queryIsActiveAdmin(userId))) return true;
  }
  return false;
}

// 管理者ならuserIdを、そうでなければnullを返す（Route Handler・useActionState用の非throw版）
export async function getAdminUserId(): Promise<string | null> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return (await isActiveAdmin(userId)) ? userId : null;
}

export async function requireAdmin() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) throw new Error("管理者権限が必要です");

  if (!(await isActiveAdmin(userId))) {
    throw new Error("管理者権限が必要です");
  }
  return session;
}
