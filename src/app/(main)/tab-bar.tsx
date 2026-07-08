"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const tabs = [
  {
    href: "/record",
    label: "登録",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "履歴",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    href: "/barges",
    label: "バージ残量",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12M7 3v6c0 1-1 2-1.5 3-1 1.5-1.5 3-1.5 5a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4c0-2-.5-3.5-1.5-5-.5-1-1.5-2-1.5-3V3" />
        <path d="M5.5 15h13" />
      </svg>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  // クリック直後に即座にハイライトを切り替え、ナビゲーション完了(pathname更新)を待たない
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null);
  const activeHref = optimisticHref ?? pathname;

  useEffect(() => {
    setOptimisticHref(null);
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-900">
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map((tab) => {
          const active = activeHref === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                prefetch
                onClick={() => setOptimisticHref(tab.href)}
                aria-current={active ? "page" : undefined}
                className="flex min-h-16 flex-col items-center justify-center gap-1 py-2 active:opacity-70"
              >
                <span
                  className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors ${
                    active
                      ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  <span className="h-5 w-5">{tab.icon}</span>
                </span>
                <span
                  className={`text-[11px] ${
                    active
                      ? "font-medium text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
