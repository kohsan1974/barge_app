import { prisma } from "@/lib/prisma";
import { createBarge, deleteBarge, setBargeStatus, updateBargeField } from "@/lib/actions/barges";
import {
  createVessel,
  deleteVessel,
  setVesselStatus,
  addVesselContent,
  removeVesselContent,
  updateVesselField,
  setVesselDepartmentLink,
} from "@/lib/actions/vessels";
import { createTruck, updateTruck, toggleTruckActive, deleteTruck } from "@/lib/actions/trucks";
import type { Department, ItemType, Truck, Vessel, VesselItemType } from "@/generated/prisma/client";
import { ActionButton, PrimaryButton, Select, TextInput } from "@/components/ui";
import { AutoText, AutoCheckbox, VesselDeptRow, ConfirmButton } from "@/components/admin-autosave";

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
  departmentLinks: { departmentId: string; allowReceiving: boolean; allowSourcing: boolean }[];
  _count: { transactions: number };
};

// タンク名は「1」「2」「10」等の番号運用なので数値順に並べる
function byNumericName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, "ja", { numeric: true });
}

// タンク1行分の編集欄。各コントロールは変更時に即保存（オートセーブ）する。
// 一括保存フォームは廃止したので、削除・廃止・内容物操作は素のネイティブ<form>を直接置く
function TankFields({ vessel, departments }: { vessel: VesselWithMeta; departments: Department[] }) {
  const deletable = vessel._count.transactions === 0;
  return (
    <div className="border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-sm">
          <AutoText
            initialValue={vessel.name}
            onSave={updateVesselField.bind(null, vessel.id, "name")}
            required
            className="w-14 px-2 py-0.5 text-center"
          />
          <span className="text-zinc-600 dark:text-zinc-300">タンク</span>
        </span>
        <AutoCheckbox
          initialChecked={vessel.showIndividually}
          onSave={updateVesselField.bind(null, vessel.id, "showIndividually")}
          label="バージのツリーとして表示"
          className="text-xs text-zinc-600 dark:text-zinc-400"
        />
        <span className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          最大容量
          <AutoText
            initialValue={String(Number(vessel.maxCapacity))}
            onSave={updateVesselField.bind(null, vessel.id, "maxCapacity")}
            type="number"
            step="0.1"
            min="0.1"
            required
            className="w-20 px-2 py-0.5"
          />
          kL
        </span>
        <span className="text-xs text-zinc-400">現在量 {Number(vessel.currentBalance).toFixed(1)}</span>
        {vessel.status === "DECOMMISSIONED" && <span className="text-xs text-zinc-400">廃止済み</span>}
        {deletable ? (
          <form action={deleteVessel} className="inline-flex">
            <input type="hidden" name="id" value={vessel.id} />
            <ConfirmButton confirmText={`タンク「${vessel.name}」を削除します。よろしいですか？`}>
              削除
            </ConfirmButton>
          </form>
        ) : (
          <form action={setVesselStatus} className="inline-flex">
            <input type="hidden" name="id" value={vessel.id} />
            <input
              type="hidden"
              name="nextStatus"
              value={vessel.status === "ACTIVE" ? "DECOMMISSIONED" : "ACTIVE"}
            />
            <ActionButton>{vessel.status === "ACTIVE" ? "廃止する" : "再稼働する"}</ActionButton>
          </form>
        )}
      </div>

      <fieldset className="mt-1 flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">所属部署と役割（未選択のタンクはどの部署からも選択できません）</legend>
        {departments.map((d) => {
          const link = vessel.departmentLinks.find((l) => l.departmentId === d.id);
          return (
            <VesselDeptRow
              key={d.id}
              deptName={d.name}
              initialLinked={!!link}
              initialReceiving={link?.allowReceiving ?? true}
              initialSourcing={link?.allowSourcing ?? true}
              onSave={setVesselDepartmentLink.bind(null, vessel.id, d.id)}
            />
          );
        })}
      </fieldset>

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
            <form action={removeVesselContent} className="inline-flex">
              <input type="hidden" name="vesselId" value={vessel.id} />
              <input type="hidden" name="itemTypeId" value={link.itemTypeId} />
              <button
                className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700"
                aria-label={`${link.itemType.name}を解除`}
              >
                ×
              </button>
            </form>
          </span>
        ))}
        <form action={addVesselContent} className="inline-flex items-center gap-1.5">
          <input type="hidden" name="vesselId" value={vessel.id} />
          <TextInput name="contentName" required placeholder="内容物" className="w-28 px-2 py-0.5 text-xs" />
          <ActionButton tone="blue">追加</ActionButton>
        </form>
      </div>
    </div>
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
      <TextInput name="name" required placeholder="番号" className="w-16 px-2 py-0.5" />
      <TextInput
        name="maxCapacity"
        type="number"
        step="0.1"
        min="0.1"
        required
        placeholder="最大容量(kL)"
        className="w-32 px-2 py-0.5"
      />
      <fieldset className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <legend className="sr-only">所属部署（未選択のタンクはどの部署からも選択できません）</legend>
        {departments.map((d) => (
          <label key={d.id} className="flex items-center gap-0.5">
            <input type="checkbox" name="departmentIds" value={d.id} />
            {d.name}
          </label>
        ))}
      </fieldset>
      <PrimaryButton className="px-3 py-1 text-xs">タンク追加</PrimaryButton>
    </form>
  );
}

// トラック1件分の編集行（名前・所属部署をその場で保存、有効切替・削除はネイティブフォーム）
function TruckRow({ truck, departments }: { truck: Truck & { _count: { transactions: number } }; departments: Department[] }) {
  const deletable = truck._count.transactions === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
      <form action={updateTruck} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={truck.id} />
        <TextInput name="name" defaultValue={truck.name} required className="w-32 px-2 py-0.5" />
        <Select name="departmentId" defaultValue={truck.departmentId} required className="px-2 py-0.5">
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <ActionButton tone="blue">保存</ActionButton>
      </form>
      {truck.isActive ? (
        <span className="text-xs text-green-700 dark:text-green-400">有効</span>
      ) : (
        <span className="text-xs text-zinc-400">無効</span>
      )}
      <form action={toggleTruckActive}>
        <input type="hidden" name="id" value={truck.id} />
        <input type="hidden" name="nextActive" value={(!truck.isActive).toString()} />
        <ActionButton>{truck.isActive ? "無効化" : "有効化"}</ActionButton>
      </form>
      {deletable && (
        <form action={deleteTruck} className="inline-flex">
          <input type="hidden" name="id" value={truck.id} />
          <ConfirmButton confirmText={`トラック「${truck.name}」を削除します。よろしいですか？`}>削除</ConfirmButton>
        </form>
      )}
    </div>
  );
}

function SummaryChevron() {
  return <span className="text-xs text-zinc-400 transition-transform group-open:rotate-90">▶</span>;
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
    departmentLinks: { select: { departmentId: true, allowReceiving: true, allowSourcing: true } },
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
        <h1 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-50">バージ・タンクマスタ</h1>
        {errorMessage && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          バージ名をクリックすると開閉します。名前・容量・チェックは変更するとその場で自動保存され、
          欄の横に「✓ 保存」と表示されます。現在量（残量）は台帳から自動計算されるため編集できません。
        </p>
        <form
          action={createBarge}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <TextInput name="name" required placeholder="バージ名" className="px-3 py-1" />
          <PrimaryButton className="py-1">バージ追加</PrimaryButton>
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
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{barge.name}</span>
                  {barge.status === "DECOMMISSIONED" && <span className="text-xs text-zinc-400">廃止済み</span>}
                  {barge.showTotalOnly && <span className="text-xs text-zinc-400">総量のみ表示</span>}
                  <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
                    タンク{barge.vessels.length}基 ／ 総容量 {totalMax.toFixed(1)} kL
                  </span>
                </summary>

                <div>
                  <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-800">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <AutoText
                        initialValue={barge.name}
                        onSave={updateBargeField.bind(null, barge.id, "name")}
                        required
                        className="w-36 px-2 py-0.5 font-medium dark:bg-zinc-900"
                      />
                      <AutoCheckbox
                        initialChecked={barge.showTotalOnly}
                        onSave={updateBargeField.bind(null, barge.id, "showTotalOnly")}
                        label="登録タンクの総量のみで表示する"
                        className="text-xs text-zinc-600 dark:text-zinc-400"
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      {barge.status === "ACTIVE" ? (
                        <span className="text-green-700 dark:text-green-400">稼働中</span>
                      ) : (
                        <span className="text-zinc-400">廃止済み（残量一覧・記録に表示されません）</span>
                      )}
                      <form action={setBargeStatus} className="inline-flex">
                        <input type="hidden" name="id" value={barge.id} />
                        <input
                          type="hidden"
                          name="nextStatus"
                          value={barge.status === "ACTIVE" ? "DECOMMISSIONED" : "ACTIVE"}
                        />
                        <ActionButton className="text-xs">
                          {barge.status === "ACTIVE" ? "廃止する" : "再稼働する"}
                        </ActionButton>
                      </form>
                      <form action={deleteBarge} className="inline-flex">
                        <input type="hidden" name="id" value={barge.id} />
                        <ConfirmButton
                          confirmText={`バージ「${barge.name}」を削除します。よろしいですか？`}
                          className="text-xs"
                        >
                          削除
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                  {barge.vessels.length === 0 && (
                    <p className="px-4 py-2 text-xs text-zinc-400">まだタンクがありません</p>
                  )}
                  {barge.vessels.map((v) => (
                    <TankFields key={v.id} vessel={v} departments={departments} />
                  ))}
                </div>

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
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">所属なしのタンク</span>
            <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">{standaloneVessels.length}基</span>
          </summary>
          {standaloneVessels.length === 0 ? (
            <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
              所属なしのタンクはありません（バージに所属しないタンクは残量一覧に単独で表示されます）
            </p>
          ) : (
            <div className="border-t border-zinc-100 dark:border-zinc-800">
              {standaloneVessels.map((v) => (
                <TankFields key={v.id} vessel={v} departments={departments} />
              ))}
            </div>
          )}
          <TankAddForm bargeId={null} departments={departments} />
        </details>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 select-none hover:bg-zinc-50 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <SummaryChevron />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">トラックマスタ</span>
            <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">{trucks.length}台</span>
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
            <TextInput name="name" required placeholder="トラック名" className="w-32 px-2 py-0.5" />
            <Select name="departmentId" required defaultValue="" className="px-2 py-0.5">
              <option value="" disabled>
                所属部署を選択
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <PrimaryButton className="px-3 py-1 text-xs">トラック追加</PrimaryButton>
          </form>
        </details>
      </section>
    </div>
  );
}
