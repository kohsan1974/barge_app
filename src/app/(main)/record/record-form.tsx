"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { recordTransaction, type RecordTransactionState } from "@/lib/actions/record-transaction";

type Department = { id: string; name: string; type: string };
type SiteShipOption = { id: string; name: string };
type Site = { id: string; name: string; departmentIds: string[]; types: string[]; ships: SiteShipOption[] };
type Truck = { id: string; name: string; departmentId: string };
type Content = { id: string; name: string; unit: string };
type DeptRole = { departmentId: string; allowReceiving: boolean; allowSourcing: boolean };
type VesselOption = {
  id: string;
  name: string;
  // 空＝どの部署にも属していないタンクで、記録画面のどの部署からも選択できない。
  // 役割はバージ単位ではなく「タンク×部署」の組ごとに個別設定されている
  departmentRoles: DeptRole[];
  contents: Content[];
};

// 作業内容。業務フローに対応する:
//   搬入   = 外部からタンクへの受入（運搬部署のみ。運輸=トラック搬入、船舶=収集バージへの受入）
//   シフト = タンクからタンクへの移送（船舶=収集バージ→受入れタンク、恵比寿=タンク間の整理）
//   放流   = 処理後の水を外部へ払い出し（処理部署のみ）
//   出荷   = 処理後の油を外部へ払い出し（処理部署のみ）
type Operation = "RECEIVE" | "SHIFT" | "DISCHARGE" | "SHIPOUT";
const OPERATION_LABELS: Record<Operation, string> = {
  RECEIVE: "搬入",
  SHIFT: "シフト",
  DISCHARGE: "放流",
  SHIPOUT: "出荷",
};

const initialState: RecordTransactionState = { error: null };

export function RecordForm({
  departments,
  sites,
  trucks,
  vessels,
}: {
  departments: Department[];
  sites: Site[];
  trucks: Truck[];
  vessels: VesselOption[];
}) {
  const router = useRouter();

  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const selectedDepartment = departments.find((d) => d.id === departmentId);
  const isTransport = selectedDepartment?.type === "TRANSPORT";

  // 選択中の部署における、このタンクの役割を解決する。所属部署がない、または選択中の部署との
  // リンクがなければ、このタンクはそもそも選択対象外（null）
  const roleFor = useCallback(
    (v: VesselOption): { allowReceiving: boolean; allowSourcing: boolean } | null =>
      v.departmentRoles.find((r) => r.departmentId === departmentId) ?? null,
    [departmentId],
  );

  // この部署で「入れられる」タンク（搬入先・シフト先）と「出せる」タンク（シフト元・放流・出荷）
  const receivableVessels = useMemo(
    () => vessels.filter((v) => roleFor(v)?.allowReceiving ?? false),
    [vessels, roleFor],
  );
  const sourceableVessels = useMemo(
    () => vessels.filter((v) => roleFor(v)?.allowSourcing ?? false),
    [vessels, roleFor],
  );

  // 選べる作業内容は部署種別とタンク役割から導出する。
  // 運搬部署=搬入（＋出せるタンクがあればシフト）、処理部署=シフト・放流・出荷
  const operations = useMemo<Operation[]>(() => {
    if (isTransport) {
      return sourceableVessels.length > 0 ? ["RECEIVE", "SHIFT"] : ["RECEIVE"];
    }
    return sourceableVessels.length > 0 ? ["SHIFT", "DISCHARGE", "SHIPOUT"] : ["DISCHARGE", "SHIPOUT"];
  }, [isTransport, sourceableVessels]);
  // 部署切り替えで選択中の作業が対象外になった場合、レンダー中に先頭へフォールバックする
  const [selectedOperation, setSelectedOperation] = useState<Operation>(operations[0]);
  const operation = operations.includes(selectedOperation) ? selectedOperation : operations[0];
  const isReceiveOp = operation === "RECEIVE";
  const isShiftOp = operation === "SHIFT";
  const isShipOutOp = operation === "SHIPOUT";
  const isOutOp = operation === "DISCHARGE" || operation === "SHIPOUT";

  // 現場欄は搬入（現場・必須）と出荷（出荷先・必須）のみ表示する。
  // シフト・放流はタンク内部の作業のため現場を記録しない。
  // 出荷先は台帳上は現場（siteId）と同じ場所に記録される
  const showSiteField = isReceiveOp || isShipOutOp;
  const siteFieldLabel = isShipOutOp ? "出荷先" : "現場";

  // メインのタンク選択。搬入・シフトでは「入れる側」、放流・出荷では「出す側」のタンクを選ぶ
  const vesselCandidates = isOutOp ? sourceableVessels : receivableVessels;
  const [selectedVesselId, setVesselId] = useState(vesselCandidates[0]?.id ?? "");
  const vesselId = vesselCandidates.some((v) => v.id === selectedVesselId)
    ? selectedVesselId
    : (vesselCandidates[0]?.id ?? "");

  // シフトの移動元（移動先と同じタンクは選べない）。未選択時は先頭候補へフォールバックする
  const sourceCandidates = useMemo(
    () => sourceableVessels.filter((v) => v.id !== vesselId),
    [sourceableVessels, vesselId],
  );
  const [selectedSourceVesselId, setSourceVesselId] = useState("");
  const sourceVesselId = isShiftOp
    ? sourceCandidates.some((v) => v.id === selectedSourceVesselId)
      ? selectedSourceVesselId
      : (sourceCandidates[0]?.id ?? "")
    : "";

  const selectedVessel = vesselCandidates.find((v) => v.id === vesselId);
  // シフトは移動元・移動先の両方に登録されている内容物だけを選べる
  const availableContents = useMemo(() => {
    const base = selectedVessel?.contents ?? [];
    if (!isShiftOp || !sourceVesselId) return base;
    const sourceVessel = vessels.find((v) => v.id === sourceVesselId);
    const sourceIds = new Set(sourceVessel?.contents.map((c) => c.id) ?? []);
    return base.filter((c) => sourceIds.has(c.id));
  }, [selectedVessel, isShiftOp, sourceVesselId, vessels]);

  const [items, setItems] = useState<{ itemTypeId: string; quantity: string }[]>([
    { itemTypeId: vesselCandidates[0]?.contents[0]?.id ?? "", quantity: "" },
  ]);

  const [state, formAction, pending] = useActionState(
    async (prevState: RecordTransactionState, formData: FormData) => {
      const result = await recordTransaction(prevState, formData);
      if (result.success) {
        setItems([{ itemTypeId: availableContents[0]?.id ?? "", quantity: "" }]);
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  // toISOString()はUTC基準のため、日本時間の午前0時〜9時に「前日」が初期値になる。端末のローカル日付を使う
  const [businessDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  // 現場は複数部署で共用され得るため候補は全現場から探すが、選択中の部署と同じ種別（ステータス）の
  // 現場だけに絞り込み、その上で今の部署がすでに使っている現場を優先表示する
  const orderedSites = useMemo(() => {
    const sameStatus = sites.filter((s) => s.types.includes(selectedDepartment?.type ?? ""));
    const own = sameStatus.filter((s) => s.departmentIds.includes(departmentId));
    const other = sameStatus.filter((s) => !s.departmentIds.includes(departmentId));
    return [...own, ...other];
  }, [sites, departmentId, selectedDepartment]);

  // 現場は自由入力＋既存候補のコンボボックス（同名の重複登録を防ぐため、入力中に候補を表示する）
  const [siteQuery, setSiteQuery] = useState("");
  const [siteFocused, setSiteFocused] = useState(false);
  const trimmedSite = siteQuery.trim();
  const matchedSite = useMemo(
    () => orderedSites.find((s) => s.name === trimmedSite) ?? null,
    [orderedSites, trimmedSite],
  );
  const siteSuggestions = useMemo(() => {
    if (trimmedSite === "") return orderedSites.slice(0, 8);
    return orderedSites.filter((s) => s.name.includes(trimmedSite)).slice(0, 8);
  }, [orderedSites, trimmedSite]);

  // 本船は「選択された現場に登録されている本船のみ」を表示する（現場マスタでの割り振りに従う）。
  // 現場が変わって選択中の本船が候補から外れた場合は、レンダー中に「なし」へフォールバックする
  const siteShips = matchedSite?.ships ?? [];
  const [selectedShipId, setShipId] = useState("");
  const shipId = siteShips.some((s) => s.id === selectedShipId) ? selectedShipId : "";

  // トラックは記録者が選んだ部署に属するものだけを選択肢にする。トラックを持つ部署（運輸）の
  // 搬入は必ずトラックで行われるため「なし」は選べず、部署切り替え時は先頭のトラックへフォールバックする
  const departmentTrucks = useMemo(
    () => trucks.filter((t) => t.departmentId === departmentId),
    [trucks, departmentId],
  );
  const [selectedTruckId, setTruckId] = useState("");
  const truckId = departmentTrucks.some((t) => t.id === selectedTruckId)
    ? selectedTruckId
    : (departmentTrucks[0]?.id ?? "");

  function handleVesselChange(nextVesselId: string) {
    setVesselId(nextVesselId);
    // タンクごとに選べる内容物が異なるため、タンク変更時は品目行をリセットする
    const nextContents = vessels.find((v) => v.id === nextVesselId)?.contents ?? [];
    setItems([{ itemTypeId: nextContents[0]?.id ?? "", quantity: "" }]);
  }

  function addItemRow() {
    setItems((prev) => [...prev, { itemTypeId: availableContents[0]?.id ?? "", quantity: "" }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, patch: Partial<{ itemTypeId: string; quantity: string }>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const noContents = availableContents.length === 0;

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <label className="mb-1 block text-xs text-zinc-500">部署（ステータス）</label>
        {departments.length > 1 ? (
          <select
            name="departmentId"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}（{d.type === "TRANSPORT" ? "運搬" : "処理"}）
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="departmentId" value={departmentId} />
            <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {selectedDepartment?.name}（{isTransport ? "運搬" : "処理"}）
            </p>
          </>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">作業内容</label>
        {operations.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {operations.map((op) => (
              <label
                key={op}
                className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-2 text-sm ${
                  operation === op
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                    : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                <input
                  type="radio"
                  name="operation"
                  value={op}
                  checked={operation === op}
                  onChange={() => setSelectedOperation(op)}
                  className="sr-only"
                />
                {OPERATION_LABELS[op]}
              </label>
            ))}
          </div>
        ) : (
          <>
            <input type="hidden" name="operation" value={operation} />
            <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {OPERATION_LABELS[operation]}
            </p>
          </>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">業務日</label>
        <input
          type="date"
          name="businessDate"
          defaultValue={businessDate}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      {showSiteField && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">{siteFieldLabel}</label>
          <div className="relative">
            <input
              name="siteName"
              value={siteQuery}
              onChange={(e) => setSiteQuery(e.target.value)}
              onFocus={() => setSiteFocused(true)}
              onBlur={() => setSiteFocused(false)}
              required
              autoComplete="off"
              placeholder={`${siteFieldLabel}名を入力（候補から選択もできます）`}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            {siteFocused && siteSuggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {siteSuggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        // blurより先に選択を確定させる
                        e.preventDefault();
                        setSiteQuery(s.name);
                        setSiteFocused(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {trimmedSite !== "" && !matchedSite && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              未登録の{siteFieldLabel}名です。このまま記録すると新しい{siteFieldLabel}として登録されます
            </p>
          )}
        </div>
      )}

      {isReceiveOp && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            本船名（現場マスタに登録されている本船のみ表示）
          </label>
          <select
            name="shipId"
            value={shipId}
            onChange={(e) => setShipId(e.target.value)}
            disabled={!matchedSite}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            <option value="">なし（陸の施設など）</option>
            {siteShips.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!matchedSite && (
            <p className="mt-1 text-xs text-zinc-400">
              現場を確定すると、その現場に登録された本船を選べます
            </p>
          )}
        </div>
      )}

      {isReceiveOp && departmentTrucks.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">トラック</label>
          <select
            name="truckId"
            value={truckId}
            onChange={(e) => setTruckId(e.target.value)}
            required
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {departmentTrucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isShiftOp && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">移動元タンク</label>
          <select
            name="sourceVesselId"
            value={sourceVesselId}
            onChange={(e) => setSourceVesselId(e.target.value)}
            required
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {sourceCandidates.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            移動元の残量を減らし、移動先の残量を増やします
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          {isShiftOp ? "移動先タンク" : isOutOp ? "対象タンク" : "受入れタンク"}
        </label>
        <select
          name="vesselId"
          value={vesselId}
          onChange={(e) => handleVesselChange(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          {vesselCandidates.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-xs text-zinc-500">内容物・数量</label>
        {noContents ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            このタンクには内容物が登録されていません。管理者にタンクマスタでの内容物登録を依頼してください
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    name="itemTypeId"
                    value={item.itemTypeId}
                    onChange={(e) => updateItem(index, { itemTypeId: e.target.value })}
                    className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  >
                    {availableContents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="quantity"
                    step="0.1"
                    min="0.1"
                    required
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    placeholder="数量 (kL)"
                    className="w-40 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(index)}
                      className="text-xs text-zinc-500 underline dark:text-zinc-400"
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItemRow}
              className="mt-2 text-xs text-blue-600 underline dark:text-blue-400"
            >
              + 内容物を追加
            </button>
          </>
        )}
      </div>

      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
          記録しました
        </p>
      )}

      <button
        type="submit"
        disabled={pending || noContents}
        className="w-full rounded bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "記録中..." : `${OPERATION_LABELS[operation]}を記録する`}
      </button>
    </form>
  );
}
