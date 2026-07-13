import { prisma } from "@/lib/prisma";
import {
  createShip,
  saveShips,
  toggleShipActive,
  deleteShip,
  addShipSite,
  removeShipSite,
} from "@/lib/actions/ships";
import { StickySaveButton } from "@/components/sticky-save-button";
import { ActionButton, FieldLabel, PrimaryButton, Select, TextInput } from "@/components/ui";

const FORM_ID = "ships-form";

const errorMessages: Record<string, string> = {
  invalid_ship: "本船名を入力してください",
  invalid_imo: "IMO番号は7桁の数字で入力してください（持たない船は空欄のままにしてください）",
  duplicate_ship: "同じ名前の本船がすでに登録されています",
  duplicate_imo: "同じIMO番号の本船がすでに登録されています",
  has_transactions: "記録から参照されている本船は削除できません（台帳の証跡を保つため。代わりに無効化してください）",
};

export default async function ShipsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : null;

  const [ships, sites] = await Promise.all([
    prisma.ship.findMany({
      orderBy: { name: "asc" },
      include: {
        siteLinks: { include: { site: true }, orderBy: { site: { name: "asc" } } },
        _count: { select: { transactions: true } },
      },
    }),
    prisma.site.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          本船マスタ
        </h1>
        {errorMessage && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          本船は複数の現場に所属できます（記録画面では、選択した現場に登録された本船のみが選択肢に表示されます）。
          現場はプルダウンから選んで追加します。IMO番号は7桁・任意で、名前とIMO番号は重複登録できません。
        </p>
        <form
          action={createShip}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <FieldLabel>本船名</FieldLabel>
            <TextInput name="name" required className="py-1.5" />
          </div>
          <div>
            <FieldLabel>IMO番号（7桁・任意）</FieldLabel>
            <TextInput
              name="imoNumber"
              pattern="\d{7}"
              inputMode="numeric"
              placeholder="1234567"
              className="w-32 py-1.5"
            />
          </div>
          <div>
            <FieldLabel>所属現場（任意・後から追加できます）</FieldLabel>
            <Select name="siteIds" defaultValue="" className="py-1.5">
              <option value="">選択しない</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <PrimaryButton>追加</PrimaryButton>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium whitespace-nowrap">本船名 / IMO番号</th>
              <th className="px-4 py-2 font-medium">所属現場</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">記録数</th>
              <th className="px-4 py-2 font-medium">状態</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {ships.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-400">
                  まだ本船が登録されていません
                </td>
              </tr>
            ) : (
              ships.map((ship) => {
                const assignedSiteIds = new Set(ship.siteLinks.map((l) => l.siteId));
                // 追加プルダウンには未割り当ての現場だけを出す（割り当て済みはチップで表示中）
                const unassignedSites = sites.filter((s) => !assignedSiteIds.has(s.id));
                return (
                  <tr key={ship.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="shipIds" value={ship.id} form={FORM_ID} />
                        <TextInput
                          name={`shipName_${ship.id}`}
                          defaultValue={ship.name}
                          form={FORM_ID}
                          className="w-36 px-2 py-1"
                        />
                        <TextInput
                          name={`shipImo_${ship.id}`}
                          defaultValue={ship.imoNumber ?? ""}
                          pattern="\d{7}"
                          inputMode="numeric"
                          placeholder="IMO番号"
                          form={FORM_ID}
                          className="w-28 px-2 py-1"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ship.siteLinks.map((link) => (
                          <form key={link.id} action={removeShipSite} className="inline-flex">
                            <input type="hidden" name="shipId" value={ship.id} />
                            <input type="hidden" name="siteId" value={link.siteId} />
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pr-1 pl-2.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {link.site.name}
                              <button
                                className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700"
                                aria-label={`${link.site.name}を解除`}
                              >
                                ×
                              </button>
                            </span>
                          </form>
                        ))}
                        {unassignedSites.length > 0 && (
                          <form action={addShipSite} className="inline-flex items-center gap-1">
                            <input type="hidden" name="shipId" value={ship.id} />
                            <Select name="siteId" required defaultValue="" className="px-2 py-0.5 text-xs">
                              <option value="" disabled>
                                現場を選択
                              </option>
                              {unassignedSites.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </Select>
                            <ActionButton tone="blue">追加</ActionButton>
                          </form>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {ship._count.transactions}
                    </td>
                    <td className="px-4 py-2">
                      {ship.isActive ? (
                        <span className="text-green-700 dark:text-green-400">有効</span>
                      ) : (
                        <span className="text-zinc-400">無効</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <form action={toggleShipActive}>
                          <input type="hidden" name="id" value={ship.id} />
                          <input type="hidden" name="nextActive" value={(!ship.isActive).toString()} />
                          <ActionButton>{ship.isActive ? "無効化" : "有効化"}</ActionButton>
                        </form>
                        {ship._count.transactions === 0 && (
                          <form action={deleteShip}>
                            <input type="hidden" name="id" value={ship.id} />
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

      {/* 名前・IMO番号の一括保存フォーム本体＋保存ボタン。各フィールドはform属性でここに紐づく
          （現場の割り当てはチップUIで即時保存されるため一括保存の対象外） */}
      <StickySaveButton formId={FORM_ID} action={saveShips} />
    </div>
  );
}
