import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// JWTのroleだけを信用せず、毎回DBで現在の権限と有効状態を確認する。
// これにより「無効化済みユーザーの残存セッション」「降格後の古いトークン」での管理操作を防ぐ。

// 管理者ならuserIdを、そうでなければnullを返す（Route Handler・useActionState用の非throw版）
export async function getAdminUserId(): Promise<string | null> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  return user?.isActive && user.role === "ADMIN" ? userId : null;
}

export async function requireAdmin() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) throw new Error("管理者権限が必要です");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user?.isActive || user.role !== "ADMIN") {
    throw new Error("管理者権限が必要です");
  }
  return session;
}
