import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PasswordForm } from "./password-form";

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      departmentLinks: { where: { isActive: true }, include: { department: true } },
    },
  });
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">アカウント設定</h1>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <dl className="space-y-1">
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-zinc-500">表示名</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{user.displayName}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-zinc-500">ログインID</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{user.loginId}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-zinc-500">所属部署</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">
                {user.departmentLinks.length > 0
                  ? user.departmentLinks.map((l) => l.department.name).join("、")
                  : "（未割当）"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">パスワード変更</h2>
        <PasswordForm />
      </div>
    </div>
  );
}
