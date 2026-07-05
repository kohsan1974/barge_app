import type { NextAuthConfig } from "next-auth";

// Edge Runtime(middleware)からも読み込める、Prisma等のNode専用コードを含まない設定。
// Credentials providerの実装(DBアクセスを伴う)はauth.tsで追加する。
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string | undefined;
        (session.user as { role?: string; id?: string }).id = token.id as string | undefined;
      }
      return session;
    },
  },
};
