import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const navItems = [
  { href: "/admin/accounts", label: "アカウント管理" },
  { href: "/admin/departments", label: "部署" },
  { href: "/admin/sites", label: "現場" },
  { href: "/admin/vessels", label: "バージ・タンク" },
  { href: "/admin/calibration", label: "残量調整" },
  { href: "/admin/corrections", label: "記録の訂正" },
  { href: "/admin/export", label: "エクスポート" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  // JWTのroleではなくDBの現在値で判定する（無効化・降格が即座に反映されるように）
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!me?.isActive || me.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            受入・タンク管理システム
          </Link>
          <span className="text-sm text-zinc-400">管理者設定</span>
        </div>
        <Link href="/" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ダッシュボードへ戻る
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-8 py-8">
        <nav className="w-44 shrink-0">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
