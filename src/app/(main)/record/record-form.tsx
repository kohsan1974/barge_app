"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { recordTransaction, type RecordTransactionState } from "@/lib/actions/record-transaction";

type Department = { id: string; name: string; type: string; requiresTransfer: boolean };
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
  const isReceive = selectedDepartment?.type === "TRANSPORT";
  // 部署マスタで「バージ間シフト」に指定された部署は、種別に関わらず常に搬入タンク（移動元）・
  // 受入れタンク（移動先）の両方を必須にした振替として記録する（例：処理部署だが実態はバージtoバージの移送）
  const isShift = selectedDepartment?.requiresTransfer ?? false;

  // 選択中の部署における、このタンクの役割を解決する。所属部署がない、または選択中の部署との
  // リンクがなければ、このタンクはそもそも選択対象外（null）
  const roleFor = useCallback(
    (v: VesselOption): { allowReceiving: boolean; allowSourcing: boolean } | null =>
      v.departmentRoles.find((r) => r.departmentId === departmentId) ?? null,
    [departmentId],
  );

  // 受入れタンクは「この部署での受入れタンクとして使う設定があるもの」だけに絞り込む
  const filteredVessels = useMemo(
    () => vessels.filter((v) => roleFor(v)?.allowReceiving ?? false),
    [vessels, roleFor],
  );
  // 部署切り替え等で選択中のタンクが絞り込み対象外になった場合、レンダー中に先頭のタンクへフォールバックする
  const [selectedVesselId, setVesselId] = useState(filteredVessels[0]?.id ?? "");
  const vesselId = filteredVessels.some((v) => v.id === selectedVesselId)
    ? selectedVesselId
    : (filteredVessels[0]?.id ?? "");

  // 搬入タンク（振替元・任意）：選択すると「タンク間振替」として記録し、振替元の残量を減らして
  // 受入れタンクの残量を増やす。選択肢は「この部署での搬入タンクとして使う設定があるもの」に絞り込み、
  // 受入れタンク自身は除く（受入れタンクと搬入タンクの絞り込みは別属性のため独立して評価する）
  const sourceCandidates = useMemo(
    () => vessels.filter((v) => (roleFor(v)?.allowSourcing ?? false) && v.id !== vesselId),
    [vessels, roleFor, vesselId],
  );
  // バージ間シフト部署は移動元が必須のため、未選択時は先頭候補へフォールバックする（受入れタンクと同じ扱い）
  const [selectedSourceVesselId, setSourceVesselId] = useState("");
  const sourceVesselId = sourceCandidates.some((v) => v.id === selectedSourceVesselId)
    ? selectedSourceVesselId
    : isShift
      ? (sourceCandidates[0]?.id ?? "")
      : "";
  const isTransfer = sourceVesselId !== "";

  const selectedVessel = filteredVessels.find((v) => v.id === vesselId);
  // 振替の場合は搬入タンク（振替元）にも登録されている内容物だけを選べるようにする
  const availableContents = useMemo(() => {
    const destContents = selectedVessel?.contents ?? [];
    if (!sourceVesselId) return destContents;
    const sourceVessel = vessels.find((v) => v.id === sourceVesselId);
    const sourceIds = new Set(sourceVessel?.contents.map((c) => c.id) ?? []);
    return destContents.filter((c) => sourceIds.has(c.id));
  }, [selectedVessel, sourceVesselId, vessels]);

  const [items, setItems] = useState<{ itemTypeId: string; quantity: string }[]>([
    { itemTypeId: filteredVessels[0]?.contents[0]?.id ?? "", quantity: "" },
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

  // トラックは記録者が選んだ部署に属するものだけを選択肢にする。
  // 部署切り替えで選択中のトラックが対象外になった場合も、レンダー中に「なし」へフォールバックする
  const departmentTrucks = useMemo(
    () => trucks.filter((t) => t.departmentId === departmentId),
    [trucks, departmentId],
  );
  const [selectedTruckId, setTruckId] = useState("");
  const truckId = departmentTrucks.some((t) => t.id === selectedTruckId) ? selectedTruckId : "";

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
                {d.name}（{d.type === "TRANSPORT" ? "搬入" : "処理"}）
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="departmentId" value={departmentId} />
            <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {selectedDepartment?.name}（{isReceive ? "搬入" : "処理"}）
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

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          現場{isReceive ? "" : "（処理の場合は任意）"}
        </label>
        <div className="relative">
          <input
            name="siteName"
            value={siteQuery}
            onChange={(e) => setSiteQuery(e.target.value)}
            onFocus={() => setSiteFocused(true)}
            onBlur={() => setSiteFocused(false)}
            required={isReceive}
            autoComplete="off"
            placeholder="現場名を入力（候補から選択もできます）"
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
            未登録の現場名です。このまま記録すると新しい現場として登録されます
          </p>
        )}
      </div>

      {isReceive && (
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

      {isReceive && departmentTrucks.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">トラック（任意）</label>
          <select
            name="truckId"
            value={truckId}
            onChange={(e) => setTruckId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            <option value="">なし</option>
            {departmentTrucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(isReceive || isShift) && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            搬入タンク（移動元）{isShift ? "" : "・振替元・任意"}
          </label>
          <select
            name="sourceVesselId"
            value={sourceVesselId}
            onChange={(e) => setSourceVesselId(e.target.value)}
            required={isShift}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {!isShift && <option value="">なし（通常の搬入）</option>}
            {sourceCandidates.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {isTransfer && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {isShift
                ? "バージ間シフトとして記録します（移動元の残量を減らし、移動先の残量を増やします）"
                : "タンク間振替として記録します（搬入タンクの残量を減らし、受入れタンクの残量を増やします）"}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-zinc-500">受入れタンク</label>
        <select
          name="vesselId"
          value={vesselId}
          onChange={(e) => handleVesselChange(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          {filteredVessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-xs text-zinc-500">
          内容物・数量
          {isTransfer
            ? "（振替数量・正の値のみ）"
            : isReceive && "（出荷の場合はマイナスの数量を入力）"}
        </label>
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
                    required
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    placeholder={
                      isTransfer ? "振替数量 (kL)" : isReceive ? "数量 (kL・出荷は負数)" : "数量 (kL)"
                    }
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
        {pending ? "記録中..." : "記録する"}
      </button>
    </form>
  );
}
