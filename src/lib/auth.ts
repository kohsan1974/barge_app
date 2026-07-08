import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { isRateLimited, recordFailure, clearFailures } from "@/lib/rate-limit";

// ユーザーが存在しない場合も同等の計算時間を消費させ、
// 応答時間の差からメールアドレスの存在を推測されるのを防ぐ
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await bcrypt.hash("timing-equalizer-dummy", 10);
  return dummyHash;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        loginId: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      authorize: async (credentials) => {
        // アカウントは小文字で保存しているため、入力側も正規化して照合する
        const loginId = (credentials?.loginId as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!loginId || !password) return null;

        // 15分間に5回失敗したログインIDは、正しいパスワードでも一時的に拒否する
        if (isRateLimited(loginId)) return null;

        const user = await prisma.user.findUnique({ where: { loginId } });
        if (!user || !user.isActive) {
          await bcrypt.compare(password, await getDummyHash());
          recordFailure(loginId);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          recordFailure(loginId);
          return null;
        }

        clearFailures(loginId);
        return { id: user.id, loginId: user.loginId, name: user.displayName, role: user.role };
      },
    }),
  ],
});
