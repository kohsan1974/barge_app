import { prisma } from "@/lib/prisma";
import { createDepartment, updateDepartmentField, toggleDepartmentActive } from "@/lib/actions/departments";
import { ActionButton, FieldLabel, PrimaryButton, Select, TextInput } from "@/components/ui";
import { AutoText, AutoSelect } from "@/components/admin-autosave";

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
            <FieldLabel>部署名</FieldLabel>
            <TextInput name="name" required className="py-1.5" />
          </div>
          <div>
            <FieldLabel>種別</FieldLabel>
            <Select name="type" className="py-1.5">
              <option value="TRANSPORT">運搬部署</option>
              <option value="PROCESSING">処理部署</option>
            </Select>
          </div>
          <PrimaryButton>追加</PrimaryButton>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <AutoText
                      initialValue={d.name}
                      onSave={updateDepartmentField.bind(null, d.id, "name")}
                      required
                      className="px-2 py-1"
                    />
                    <AutoSelect
                      initialValue={d.type}
                      onSave={updateDepartmentField.bind(null, d.id, "type")}
                      className="px-2 py-1"
                    >
                      <option value="TRANSPORT">運搬部署</option>
                      <option value="PROCESSING">処理部署</option>
                    </AutoSelect>
                  </div>
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
                    <ActionButton>{d.isActive ? "無効化" : "有効化"}</ActionButton>
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
