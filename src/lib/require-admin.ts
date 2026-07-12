import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// JWTのroleだけを信用せず、毎回DBで現在の権限と有効状態を確認する。
// これにより「無効化済みユーザーの残存セッション」「降格後の古いトークン」での管理操作を防ぐ。
// 判定の実体はisActiveAdminに一元化し、レイアウトの表示判定も含め全箇所で同じ基準を使う

// 指定ユーザーが「現在有効な管理者」かをDBの現在値で判定する
export async function isActiveAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  return !!user?.isActive && user.role === "ADMIN";
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
