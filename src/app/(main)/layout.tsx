import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TabBar } from "./tab-bar";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  // JWTのroleは降格後も古い値が残り得るため、表示判定は毎回DBの現在値で確認する（requireAdminと同じ方針）
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }) : null;
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3 sm:px-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="truncate text-base font-semibold text-zinc-900 sm:text-lg dark:text-zinc-50">
          受入・タンク管理システム
        </h1>
        <div className="flex shrink-0 items-center gap-3 text-xs sm:text-sm">
          <Link
            href="/settings"
            title="アカウント設定・パスワード変更"
            className="text-zinc-600 underline decoration-zinc-300 underline-offset-2 dark:text-zinc-400 dark:decoration-zinc-600"
          >
            {session?.user?.name}さん
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-zinc-500 underline dark:text-zinc-400">
              管理者ホーム
            </Link>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="text-zinc-500 underline dark:text-zinc-400">ログアウト</button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-10">
        {children}
      </main>

      <TabBar />
    </div>
  );
}
