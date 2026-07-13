import { prisma } from "@/lib/prisma";
import {
  createSite,
  saveSites,
  toggleSiteActive,
  mergeSites,
  deleteSite,
} from "@/lib/actions/sites";
import { addShipSite, removeShipSite } from "@/lib/actions/ships";
import { StickySaveButton } from "@/components/sticky-save-button";
import { ActionButton, FieldLabel, PrimaryButton, Select, TextInput } from "@/components/ui";

const FORM_ID = "sites-form";

const errorMessages: Record<string, string> = {
  not_found: "対象の現場が見つかりません",
  duplicate_site: "同じ名前の現場がすでに登録されています",
  no_department: "所属部署を1つ以上選択してください",
  merge_selection: "統合先（残す現場）と統合元（まとめる現場）をそれぞれ選択してください",
  merge_reason: "統合理由を入力してください（過去の記録の現場名が変わる操作のため、監査ログに残ります）",
  has_transactions: "記録から参照されている現場は削除できません（統合または無効化を使ってください）",
};

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : null;

  const [sites, departments, ships] = await Promise.all([
    prisma.site.findMany({
      include: {
        departmentLinks: { include: { department: true } },
        shipLinks: { include: { ship: true }, orderBy: { ship: { name: "asc" } } },
        _count: { select: { transactions: true } },
      },
    }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.ship.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  // 同名・類似名の重複を見つけやすいよう、所属部署名→現場名で並べる（多対多のためJS側でソート）
  sites.sort((a, b) => {
    const aDept = a.departmentLinks.map((l) => l.department.name).sort().join("、");
    const bDept = b.departmentLinks.map((l) => l.department.name).sort().join("、");
    return (aDept + a.name).localeCompare(bDept + b.name, "ja");
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          現場マスタ
        </h1>
        {errorMessage && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          現場名は保存時に前後の空白のみ自動的に除去されます。記録画面からの自由入力でも自動登録されます。
          一つの現場を複数部署が使う場合は、所属部署を複数選択できます。
          本船はプルダウンから選んで現場に追加できます（本船自体の新規登録・IMO番号の編集は「本船」ページ。
          どちらのページから追加・解除しても同じ紐付けが更新されます）。
        </p>
        <form
          action={createSite}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <FieldLabel>現場名</FieldLabel>
            <TextInput name="name" required className="py-1.5" />
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 block text-xs text-zinc-500">所属部署（複数選択可）</legend>
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

      {/* 重複統合フォーム本体。行内のラジオ/チェックはform属性でここに紐づく */}
      <form id="merge-form" action={mergeSites} />
      {/* 全現場共通の一括保存フォーム本体（現場名・所属部署編集用）。フィールドはform属性でここに紐づく */}
      <form id={FORM_ID} action={saveSites} />
      <StickySaveButton formId={FORM_ID} />

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-800">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            かぶって登録された現場は、<span className="font-medium">残す方に「統合先」</span>・
            <span className="font-medium">まとめる方に「統合元」</span>を付けて統合できます
            （過去の記録は統合先に付け替えられ、所属部署は両方の和集合になり、統合元は削除されます。実行は監査ログに残ります）
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              form="merge-form"
              name="reason"
              required
              placeholder="統合理由（必須・例: 表記ゆれの整理）"
              className="w-64 px-2 py-1 text-xs dark:bg-zinc-900"
            />
            <PrimaryButton form="merge-form" className="px-3 py-1 text-xs">
              選択した現場を統合
            </PrimaryButton>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium whitespace-nowrap">統合先</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">統合元</th>
              <th className="px-4 py-2 font-medium">現場名 / 所属部署</th>
              <th className="px-4 py-2 font-medium">本船</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">記録数</th>
              <th className="px-4 py-2 font-medium">状態</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-400">
                  まだ現場が登録されていません
                </td>
              </tr>
            ) : (
              sites.map((s) => {
                const assignedIds = new Set(s.departmentLinks.map((l) => l.departmentId));
                const assignedShipIds = new Set(s.shipLinks.map((l) => l.shipId));
                // 追加プルダウンには未割り当ての本船だけを出す（割り当て済みはチップで表示中）
                const unassignedShips = ships.filter((ship) => !assignedShipIds.has(ship.id));
                return (
                  <tr key={s.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="radio"
                        form="merge-form"
                        name="targetId"
                        value={s.id}
                        aria-label={`${s.name}を統合先にする`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        form="merge-form"
                        name="sourceIds"
                        value={s.id}
                        aria-label={`${s.name}を統合元にする`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="siteIds" value={s.id} form={FORM_ID} />
                        <TextInput
                          name={`siteName_${s.id}`}
                          defaultValue={s.name}
                          form={FORM_ID}
                          className="px-2 py-1"
                        />
                        <span className="flex flex-wrap gap-2">
                          {departments.map((d) => (
                            <label key={d.id} className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                              <input
                                type="checkbox"
                                name={`siteDepartmentIds_${s.id}`}
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
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.shipLinks.map((link) => (
                          <form key={link.id} action={removeShipSite} className="inline-flex">
                            <input type="hidden" name="shipId" value={link.shipId} />
                            <input type="hidden" name="siteId" value={s.id} />
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pr-1 pl-2.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {link.ship.name}
                              <button
                                className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700"
                                aria-label={`${link.ship.name}を解除`}
                              >
                                ×
                              </button>
                            </span>
                          </form>
                        ))}
                        {unassignedShips.length > 0 && (
                          <form action={addShipSite} className="inline-flex items-center gap-1">
                            <input type="hidden" name="siteId" value={s.id} />
                            <Select name="shipId" required defaultValue="" className="px-2 py-0.5 text-xs">
                              <option value="" disabled>
                                本船を選択
                              </option>
                              {unassignedShips.map((ship) => (
                                <option key={ship.id} value={ship.id}>
                                  {ship.name}
                                </option>
                              ))}
                            </Select>
                            <ActionButton tone="blue">追加</ActionButton>
                          </form>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {s._count.transactions}
                    </td>
                    <td className="px-4 py-2">
                      {s.isActive ? (
                        <span className="text-green-700 dark:text-green-400">有効</span>
                      ) : (
                        <span className="text-zinc-400">無効</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <form action={toggleSiteActive}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="nextActive" value={(!s.isActive).toString()} />
                          <ActionButton>{s.isActive ? "無効化" : "有効化"}</ActionButton>
                        </form>
                        {s._count.transactions === 0 && (
                          <form action={deleteSite}>
                            <input type="hidden" name="id" value={s.id} />
                            <ActionButton tone="red">削除</ActionButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
