import { prisma } from "@/lib/prisma";
import { createBarge, deleteBarge, setBargeStatus, saveBargeSettings } from "@/lib/actions/barges";
import {
  createVessel,
  deleteVessel,
  setVesselStatus,
  addVesselContent,
  removeVesselContent,
} from "@/lib/actions/vessels";
import { createTruck, updateTruck, toggleTruckActive, deleteTruck } from "@/lib/actions/trucks";
import type { Department, ItemType, Truck, Vessel, VesselItemType } from "@/generated/prisma/client";

const errorMessages: Record<string, string> = {
  not_found: "対象のタンクが見つかりません",
  invalid_tank: "タンクの番号と最大容量（0より大きい値）を入力してください",
  duplicate_barge: "同じ名前のバージがすでに登録されています",
  duplicate_tank: "同じバージ内に同じ番号のタンクがすでに登録されています",
  capacity_below_balance: "現在の残量より小さい最大容量には変更できません（先に処理で残量を減らしてください）",
  has_vessels: "タンクが残っているバージは削除できません（先にタンクを削除するか、バージを廃止してください）",
  has_transactions: "記録のあるタンク・トラックは削除できません（台帳の証跡を保つため。代わりに無効化してください）",
  invalid_truck: "トラック名と所属部署を入力してください",
  duplicate_truck: "同じ名前のトラックがすでに登録されています",
};

type VesselWithMeta = Vessel & {
  allowedContents: (VesselItemType & { itemType: ItemType })[];
  departmentLinks: { departmentId: string }[];
  _count: { transactions: number };
};

// タンク名は「1」「2」「10」等の番号運用なので数値順に並べる
function byNumericName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, "ja", { numeric: true });
}

// 一括保存フォームの中に置くタンク1行分の入力欄。
// 削除・廃止・内容物の操作ボタンはform属性で外部のミニフォームに紐づけ、フォームの入れ子を避ける
function TankFields({ vessel, departments }: { vessel: VesselWithMeta; departments: Department[] }) {
  const deletable = vessel._count.transactions === 0;
  return (
    <div className="border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
      <input type="hidden" name="vesselId" value={vessel.id} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-sm">
          <input
            name={`vesselName_${vessel.id}`}
            defaultValue={vessel.name}
            required
            className="w-14 rounded border border-zinc-300 px-2 py-0.5 text-center text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
          <span className="text-zinc-600 dark:text-zinc-300">タンク</span>
        </span>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            name={`vesselShowIndividually_${vessel.id}`}
            defaultChecked={vessel.showIndividually}
          />
          バージのツリーとして表示
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          最大容量
          <input
            name={`vesselMaxCapacity_${vessel.id}`}
            type="number"
            step="0.1"
            min="0.1"
            required
            defaultValue={Number(vessel.maxCapacity)}
            className="w-20 rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
          kL
        </label>
        <fieldset className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <legend className="sr-only">所属部署</legend>
          <span>所属部署（未選択=全部署共通）</span>
          {departments.map((d) => (
            <label key={d.id} className="flex items-center gap-0.5">
              <input
                type="checkbox"
                name={`vesselDepartmentIds_${vessel.id}`}
                value={d.id}
                defaultChecked={vessel.departmentLinks.some((l) => l.departmentId === d.id)}
              />
              {d.name}
            </label>
          ))}
        </fieldset>
        <span className="text-xs text-zinc-400">現在量 {Number(vessel.currentBalance).toFixed(1)}</span>
        {vessel.status === "DECOMMISSIONED" && (
          <span className="text-xs text-zinc-400">廃止済み</span>
        )}
        {deletable ? (
          <button form={`tank-del-${vessel.id}`} className="text-xs text-red-600 underline dark:text-red-400">
            削除
          </button>
        ) : (
          <button form={`tank-status-${vessel.id}`} className="text-xs text-zinc-500 underline dark:text-zinc-400">
            {vessel.status === "ACTIVE" ? "廃止する" : "再稼働する"}
          </button>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-zinc-500">内容物</span>
        {vessel.allowedContents.length === 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            未登録（登録がないと記録画面でこのタンクを選べません）
          </span>
        )}
        {vessel.allowedContents.map((link) => (
          <span
            key={link.id}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pr-1 pl-2.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {link.itemType.name}
            <button
              form={`content-rm-${link.id}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700"
              aria-label={`${link.itemType.name}を解除`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          form={`content-add-${vessel.id}`}
          name="contentName"
          required
          placeholder="内容物"
          className="w-28 rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <button form={`content-add-${vessel.id}`} className="text-xs text-blue-600 underline dark:text-blue-400">
          追加
        </button>
      </div>
    </div>
  );
}

// TankFields内のボタンから参照されるミニフォーム群（一括保存フォームの外に置く）
function TankMiniForms({ vessel }: { vessel: VesselWithMeta }) {
  const deletable = vessel._count.transactions === 0;
  return (
    <>
      {deletable ? (
        <form id={`tank-del-${vessel.id}`} action={deleteVessel}>
          <input type="hidden" name="id" value={vessel.id} />
        </form>
      ) : (
        <form id={`tank-status-${vessel.id}`} action={setVesselStatus}>
          <input type="hidden" name="id" value={vessel.id} />
          <input
            type="hidden"
            name="nextStatus"
            value={vessel.status === "ACTIVE" ? "DECOMMISSIONED" : "ACTIVE"}
          />
        </form>
      )}
      {vessel.allowedContents.map((link) => (
        <form key={link.id} id={`content-rm-${link.id}`} action={removeVesselContent}>
          <input type="hidden" name="vesselId" value={vessel.id} />
          <input type="hidden" name="itemTypeId" value={link.itemTypeId} />
        </form>
      ))}
      <form id={`content-add-${vessel.id}`} action={addVesselContent}>
        <input type="hidden" name="vesselId" value={vessel.id} />
      </form>
    </>
  );
}

// バージカード内・所属なしセクション共通のタンク追加フォーム
function TankAddForm({ bargeId, departments }: { bargeId: string | null; departments: Department[] }) {
  return (
    <form
      action={createVessel}
      className="flex flex-wrap items-center gap-2 border-t border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800/40"
    >
      {bargeId && <input type="hidden" name="bargeId" value={bargeId} />}
      <input
        name="name"
        required
        placeholder="番号"
        className="w-16 rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
      />
      <input
        name="maxCapacity"
        type="number"
        step="0.1"
        min="0.1"
        required
        placeholder="最大容量(kL)"
        className="w-32 rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
      />
      <fieldset className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <legend className="sr-only">所属部署</legend>
        <span>所属部署（未選択=全部署共通）</span>
        {departments.map((d) => (
          <label key={d.id} className="flex items-center gap-0.5">
            <input type="checkbox" name="departmentIds" value={d.id} />
            {d.name}
          </label>
        ))}
      </fieldset>
      <button className="rounded bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900">
        タンク追加
      </button>
    </form>
  );
}

// トラック1件分の編集行（名前・所属部署をその場で保存、削除/無効化はミニフォームへ）
function TruckRow({ truck, departments }: { truck: Truck & { _count: { transactions: number } }; departments: Department[] }) {
  const deletable = truck._count.transactions === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
      <form action={updateTruck} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={truck.id} />
        <input
          name="name"
          defaultValue={truck.name}
          required
          className="w-32 rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <select
          name="departmentId"
          defaultValue={truck.departmentId}
          required
          className="rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button className="text-xs text-blue-600 underline dark:text-blue-400">保存</button>
      </form>
      {truck.isActive ? (
        <span className="text-xs text-green-700 dark:text-green-400">有効</span>
      ) : (
        <span className="text-xs text-zinc-400">無効</span>
      )}
      <form action={toggleTruckActive}>
        <input type="hidden" name="id" value={truck.id} />
        <input type="hidden" name="nextActive" value={(!truck.isActive).toString()} />
        <button className="text-xs text-zinc-500 underline dark:text-zinc-400">
          {truck.isActive ? "無効化" : "有効化"}
        </button>
      </form>
      {deletable && (
        <form action={deleteTruck}>
          <input type="hidden" name="id" value={truck.id} />
          <button className="text-xs text-red-600 underline dark:text-red-400">削除</button>
        </form>
      )}
    </div>
  );
}

function SummaryChevron() {
  return (
    <span className="text-xs text-zinc-400 transition-transform group-open:rotate-90">▶</span>
  );
}

export default async function VesselsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : null;

  const vesselInclude = {
    allowedContents: { include: { itemType: true }, orderBy: { itemType: { name: "asc" } } },
    departmentLinks: { select: { departmentId: true } },
    _count: { select: { transactions: true } },
  } as const;

  const [barges, standaloneVessels, departments, trucks] = await Promise.all([
    prisma.barge.findMany({
      orderBy: { name: "asc" },
      include: { vessels: { include: vesselInclude } },
    }),
    prisma.vessel.findMany({ where: { bargeId: null }, include: vesselInclude }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.truck.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { transactions: true } } },
    }),
  ]);

  for (const b of barges) b.vessels.sort(byNumericName);
  standaloneVessels.sort(byNumericName);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">
          バージ・タンクマスタ
        </h1>
        {errorMessage && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          バージ名をクリックすると開閉します。名前・容量・表示設定を変更したら、
          バージごとの「変更を保存」でまとめて保存してください。
          現在量（残量）は台帳から自動計算されるため編集できません。
        </p>
        <form
          action={createBarge}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <input
            name="name"
            required
            placeholder="バージ名"
            className="rounded border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
          <button className="rounded bg-zinc-900 px-4 py-1 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            バージ追加
          </button>
        </form>
      </div>

      <div className="space-y-3">
        {barges.map((barge) => {
          const totalMax = barge.vessels.reduce((sum, v) => sum + Number(v.maxCapacity), 0);
          return (
            <section
              key={barge.id}
              className={`overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
                barge.status === "DECOMMISSIONED" ? "opacity-60" : ""
              }`}
            >
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 select-none hover:bg-zinc-50 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
                  <SummaryChevron />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {barge.name}
                  </span>
                  {barge.status === "DECOMMISSIONED" && (
                    <span className="text-xs text-zinc-400">廃止済み</span>
                  )}
                  {barge.showTotalOnly && (
                    <span className="text-xs text-zinc-400">総量のみ表示</span>
                  )}
                  <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
                    タンク{barge.vessels.length}基 ／ 総容量 {totalMax.toFixed(1)} kL
                  </span>
                </summary>

                <form action={saveBargeSettings}>
                  <input type="hidden" name="bargeId" value={barge.id} />
                  <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-800">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <input
                        name="bargeName"
                        defaultValue={barge.name}
                        required
                        className="w-36 rounded border border-zinc-300 px-2 py-0.5 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                        <input type="checkbox" name="showTotalOnly" defaultChecked={barge.showTotalOnly} />
                        登録タンクの総量のみで表示する
                      </label>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      {barge.status === "ACTIVE" ? (
                        <span className="text-green-700 dark:text-green-400">稼働中</span>
                      ) : (
                        <span className="text-zinc-400">廃止済み（残量一覧・記録に表示されません）</span>
                      )}
                      <button
                        form={`barge-status-${barge.id}`}
                        className="text-zinc-500 underline dark:text-zinc-400"
                      >
                        {barge.status === "ACTIVE" ? "廃止する" : "再稼働する"}
                      </button>
                      <button form={`barge-del-${barge.id}`} className="text-red-600 underline dark:text-red-400">
                        削除
                      </button>
                    </div>
                  </div>
                  {barge.vessels.length === 0 && (
                    <p className="px-4 py-2 text-xs text-zinc-400">まだタンクがありません</p>
                  )}
                  {barge.vessels.map((v) => (
                    <TankFields key={v.id} vessel={v} departments={departments} />
                  ))}
                  <div className="border-t border-zinc-100 px-4 py-2 text-right dark:border-zinc-800">
                    <button className="rounded bg-zinc-900 px-4 py-1 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
                      変更を保存
                    </button>
                  </div>
                </form>

                <form id={`barge-status-${barge.id}`} action={setBargeStatus}>
                  <input type="hidden" name="id" value={barge.id} />
                  <input
                    type="hidden"
                    name="nextStatus"
                    value={barge.status === "ACTIVE" ? "DECOMMISSIONED" : "ACTIVE"}
                  />
                </form>
                <form id={`barge-del-${barge.id}`} action={deleteBarge}>
                  <input type="hidden" name="id" value={barge.id} />
                </form>
                {barge.vessels.map((v) => (
                  <TankMiniForms key={v.id} vessel={v} />
                ))}

                <TankAddForm bargeId={barge.id} departments={departments} />
              </details>
            </section>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 select-none hover:bg-zinc-50 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <SummaryChevron />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              所属なしのタンク
            </span>
            <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
              {standaloneVessels.length}基
            </span>
          </summary>
          {standaloneVessels.length === 0 ? (
            <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
              所属なしのタンクはありません（バージに所属しないタンクは残量一覧に単独で表示されます）
            </p>
          ) : (
            <form action={saveBargeSettings} className="border-t border-zinc-100 dark:border-zinc-800">
              {standaloneVessels.map((v) => (
                <TankFields key={v.id} vessel={v} departments={departments} />
              ))}
              <div className="border-t border-zinc-100 px-4 py-2 text-right dark:border-zinc-800">
                <button className="rounded bg-zinc-900 px-4 py-1 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
                  変更を保存
                </button>
              </div>
            </form>
          )}
          {standaloneVessels.map((v) => (
            <TankMiniForms key={v.id} vessel={v} />
          ))}
          <TankAddForm bargeId={null} departments={departments} />
        </details>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 select-none hover:bg-zinc-50 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <SummaryChevron />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              トラックマスタ
            </span>
            <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
              {trucks.length}台
            </span>
          </summary>
          <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            搬入用の陸送車両です。容量・残量の管理対象外で、記録画面では登録者の所属部署のトラックのみ選択肢に表示されます。
          </p>
          {trucks.length === 0 ? (
            <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
              まだトラックが登録されていません
            </p>
          ) : (
            trucks.map((t) => <TruckRow key={t.id} truck={t} departments={departments} />)
          )}
          <form
            action={createTruck}
            className="flex flex-wrap items-center gap-2 border-t border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800/40"
          >
            <input
              name="name"
              required
              placeholder="トラック名"
              className="w-32 rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            <select
              name="departmentId"
              required
              defaultValue=""
              className="rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="" disabled>
                所属部署を選択
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button className="rounded bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900">
              トラック追加
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
