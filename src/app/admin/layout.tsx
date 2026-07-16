import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isActiveAdmin } from "@/lib/require-admin";

const navItems = [
  { href: "/admin/accounts", label: "アカウント管理" },
  { href: "/admin/departments", label: "部署" },
  { href: "/admin/sites", label: "現場" },
  { href: "/admin/ships", label: "本船" },
  { href: "/admin/vessels", label: "バージ・タンク" },
  { href: "/admin/calibration", label: "残量調整" },
  { href: "/admin/export", label: "エクスポート" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  // JWTのroleではなくDBの現在値で判定する（無効化・降格が即座に反映されるように）
  if (!(await isActiveAdmin(userId))) {
    redirect("/");
  }

  // スマホは縦積み（メニューは上部の横スクロールチップ）、md以上は従来の左サイドバー。
  // 管理画面をスマホ幅に収めてピンチズーム不要にする（ズーム中はiOS Safariの
  // タップ判定ずれ等の不具合を踏むため、横スクロールが必要な表はページ全体ではなく表だけをスクロールさせる）
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-zinc-200 bg-white px-4 py-3 md:px-8 md:py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 md:gap-6">
          <Link href="/" className="text-base font-semibold text-zinc-900 md:text-lg dark:text-zinc-50">
            受入・タンク管理システム
          </Link>
          <span className="text-sm text-zinc-400">管理者設定</span>
        </div>
        <Link href="/" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ダッシュボードへ戻る
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4 md:flex-row md:gap-8 md:px-8 md:py-8">
        <nav className="md:w-44 md:shrink-0">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0">
            {navItems.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className="block rounded border border-zinc-200 bg-white px-3 py-1.5 text-sm whitespace-nowrap text-zinc-700 hover:bg-zinc-100 md:border-0 md:bg-transparent md:py-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 md:dark:bg-transparent dark:hover:bg-zinc-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
