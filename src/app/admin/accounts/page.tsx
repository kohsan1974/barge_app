import { prisma } from "@/lib/prisma";
import { createAccount, saveAccounts, toggleAccountActive, deleteAccount } from "@/lib/actions/accounts";
import { StickySaveButton } from "@/components/sticky-save-button";
import { ActionButton, FieldLabel, PrimaryButton, Select, TextInput } from "@/components/ui";

const FORM_ID = "accounts-form";

const errorMessages: Record<string, string> = {
  invalid_login_id: "ログインIDは半角英数字・.・_・-のみ、3〜32文字で入力してください",
  invalid_name: "表示名を入力してください",
  weak_password: "パスワードは8文字以上にしてください",
  duplicate_login_id: "このログインIDは既に使われています",
  last_admin: "最後の有効な管理者を無効化・降格・削除することはできません",
  not_found: "対象のアカウントが見つかりません",
  has_records: "記録のあるアカウントは削除できません（台帳の証跡を保つため。代わりに無効化してください）",
};

const okMessages: Record<string, string> = {
  created: "アカウントを作成しました",
  updated: "アカウントを更新しました",
  deleted: "アカウントを削除しました",
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const okMessage = params.ok ? okMessages[params.ok] : null;

  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      orderBy: { loginId: "asc" },
      include: {
        departmentLinks: { where: { isActive: true }, include: { department: true } },
        // 台帳・監査ログから参照されているアカウントは削除ボタンを出さない（証跡保護）
        _count: {
          select: {
            recordedTransactions: true,
            approvedTransactions: true,
            exportRequests: true,
            siteMergeLogs: true,
          },
        },
      },
    }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          アカウント管理
        </h1>
        {errorMessage && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        {okMessage && (
          <p className="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
            {okMessage}
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          ログインIDは管理者が発行します（会社メールを持たない作業者にも対応、半角英数字・.・_・-のみ、3〜32文字）。
          表示名は保存時に文字列内のすべての空白（全角・半角）が自動的に除去されます。部署は複数選択でき、兼任している作業者に対応します。
        </p>
        <form
          action={createAccount}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <FieldLabel>ログインID</FieldLabel>
            <TextInput name="loginId" type="text" required pattern="[A-Za-z0-9_.@\-]{3,32}" className="py-1.5" />
          </div>
          <div>
            <FieldLabel>表示名</FieldLabel>
            <TextInput name="displayName" required className="py-1.5" />
          </div>
          <div>
            <FieldLabel>初期パスワード（8文字以上）</FieldLabel>
            <TextInput name="password" type="text" required minLength={8} className="py-1.5" />
          </div>
          <div>
            <FieldLabel>権限</FieldLabel>
            <Select name="role" className="py-1.5">
              <option value="STAFF">一般</option>
              <option value="ADMIN">管理者</option>
            </Select>
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 block text-xs text-zinc-500">所属部署</legend>
            {departments.map((d) => (
              <label key={d.id} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="checkbox" name="departmentIds" value={d.id} />
                {d.name}
              </label>
            ))}
          </fieldset>
          <PrimaryButton>追加</PrimaryButton>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">ログインID / 表示名 / 権限 / 所属部署 / パスワード再設定</th>
              <th className="px-4 py-2 font-medium">状態</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const assignedIds = new Set(u.departmentLinks.map((l) => l.departmentId));
              const deletable =
                u._count.recordedTransactions +
                  u._count.approvedTransactions +
                  u._count.exportRequests +
                  u._count.siteMergeLogs ===
                0;
              return (
                <tr key={u.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="userIds" value={u.id} form={FORM_ID} />
                      <TextInput
                        name={`loginId_${u.id}`}
                        defaultValue={u.loginId}
                        pattern="[A-Za-z0-9_.@\-]{3,32}"
                        form={FORM_ID}
                        className="w-28 px-2 py-1"
                      />
                      <TextInput
                        name={`displayName_${u.id}`}
                        defaultValue={u.displayName}
                        form={FORM_ID}
                        className="w-28 px-2 py-1"
                      />
                      <Select name={`role_${u.id}`} defaultValue={u.role} form={FORM_ID} className="px-2 py-1">
                        <option value="STAFF">一般</option>
                        <option value="ADMIN">管理者</option>
                      </Select>
                      <TextInput
                        name={`password_${u.id}`}
                        type="text"
                        placeholder="変更する場合のみ入力"
                        minLength={8}
                        form={FORM_ID}
                        className="w-40 px-2 py-1"
                      />
                      <span className="flex flex-wrap gap-2">
                        {departments.map((d) => (
                          <label key={d.id} className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            <input
                              type="checkbox"
                              name={`departmentIds_${u.id}`}
                              value={d.id}
                              defaultChecked={assignedIds.has(d.id)}
                              form={FORM_ID}
                            />
                            {d.name}
                          </label>
                        ))}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="text-green-700 dark:text-green-400">有効</span>
                    ) : (
                      <span className="text-zinc-400">無効</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <form action={toggleAccountActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="nextActive" value={(!u.isActive).toString()} />
                        <ActionButton>{u.isActive ? "無効化" : "有効化"}</ActionButton>
                      </form>
                      {deletable && (
                        <form action={deleteAccount}>
                          <input type="hidden" name="id" value={u.id} />
                          <ActionButton tone="red">削除</ActionButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 全アカウント共通の一括保存フォーム本体＋保存ボタン。各フィールドはform属性でここに紐づく */}
      <StickySaveButton formId={FORM_ID} action={saveAccounts} />
    </div>
  );
}
