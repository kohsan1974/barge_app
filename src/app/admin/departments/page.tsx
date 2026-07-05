import { prisma } from "@/lib/prisma";
import { createDepartment, updateDepartment, toggleDepartmentActive } from "@/lib/actions/departments";

const typeLabel: Record<string, string> = {
  TRANSPORT: "運搬部署",
  PROCESSING: "処理部署",
};

export default async function DepartmentsPage() {
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          部署マスタ
        </h1>
        <form
          action={createDepartment}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-xs text-zinc-500">部署名</label>
            <input
              name="name"
              required
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">種別</label>
            <select
              name="type"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="TRANSPORT">運搬部署</option>
              <option value="PROCESSING">処理部署</option>
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
              <th className="px-4 py-2 font-medium">部署名</th>
              <th className="px-4 py-2 font-medium">種別</th>
              <th className="px-4 py-2 font-medium">状態</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td className="px-4 py-2">
                  <form action={updateDepartment} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input
                      name="name"
                      defaultValue={d.name}
                      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    />
                    <select
                      name="type"
                      defaultValue={d.type}
                      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    >
                      <option value="TRANSPORT">運搬部署</option>
                      <option value="PROCESSING">処理部署</option>
                    </select>
                    <button className="text-xs text-blue-600 underline dark:text-blue-400">保存</button>
                  </form>
                </td>
                <td className="px-4 py-2 text-zinc-500">{typeLabel[d.type]}</td>
                <td className="px-4 py-2">
                  {d.isActive ? (
                    <span className="text-green-700 dark:text-green-400">有効</span>
                  ) : (
                    <span className="text-zinc-400">無効</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={toggleDepartmentActive}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="nextActive" value={(!d.isActive).toString()} />
                    <button className="text-xs text-zinc-500 underline dark:text-zinc-400">
                      {d.isActive ? "無効化" : "有効化"}
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
