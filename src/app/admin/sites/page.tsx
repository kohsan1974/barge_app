import { prisma } from "@/lib/prisma";
import { createSite, updateSite, toggleSiteActive } from "@/lib/actions/sites";

export default async function SitesPage() {
  const [sites, departments] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: "asc" }, include: { department: true } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          現場マスタ
        </h1>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          現場名は保存時に前後の空白のみ自動的に除去されます。
        </p>
        <form
          action={createSite}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-xs text-zinc-500">現場名</label>
            <input
              name="name"
              required
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">所属部署</label>
            <select
              name="departmentId"
              required
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            追加
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">現場名 / 所属部署</th>
              <th className="px-4 py-2 font-medium">状態</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td className="px-4 py-2">
                  <form action={updateSite} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      name="name"
                      defaultValue={s.name}
                      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    />
                    <select
                      name="departmentId"
                      defaultValue={s.departmentId}
                      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button className="text-xs text-blue-600 underline dark:text-blue-400">保存</button>
                  </form>
                </td>
                <td className="px-4 py-2">
                  {s.isActive ? (
                    <span className="text-green-700 dark:text-green-400">有効</span>
                  ) : (
                    <span className="text-zinc-400">無効</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={toggleSiteActive}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="nextActive" value={(!s.isActive).toString()} />
                    <button className="text-xs text-zinc-500 underline dark:text-zinc-400">
                      {s.isActive ? "無効化" : "有効化"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
