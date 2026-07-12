import { prisma } from "@/lib/prisma";
import { vesselLabel } from "@/lib/labels";
import { CalibrationForm } from "./calibration-form";

export default async function CalibrationPage() {
  const [vessels, recentCalibrations] = await Promise.all([
    prisma.vessel.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: { barge: true },
    }),
    prisma.tankTransaction.findMany({
      where: { transactionType: "CALIBRATION" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { vessel: { include: { barge: true } }, recordedBy: true },
    }),
  ]);

  const vesselOptions = vessels
    .map((v) => ({
      id: v.id,
      name: vesselLabel(v),
      currentBalance: Number(v.currentBalance),
      maxCapacity: Number(v.maxCapacity),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-base font-medium text-zinc-900 dark:text-zinc-50">
          残量調整（キャリブレーション）
        </h1>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          実測した残量とシステム上の残量に乖離がある場合に補正します。補正は台帳に「調整」として記録され、
          いつ・誰が・何kLの差をなぜ補正したかが監査証跡として残ります（過去の記録は書き換わりません）。
        </p>
        <CalibrationForm vessels={vesselOptions} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">直近の調整履歴</h2>
        {recentCalibrations.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ調整記録がありません。</p>
        ) : (
          <ul className="space-y-2">
            {recentCalibrations.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {vesselLabel(c.vessel)}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {c.businessDate.toISOString().slice(0, 10)}
                  </span>
                </div>
                <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                  システム値 {Number(c.systemValueBefore).toFixed(2)}kL → 実測 {Number(c.measuredValue).toFixed(2)}kL
                  （差 {Number(c.quantity) >= 0 ? "+" : ""}
                  {Number(c.quantity).toFixed(2)}kL）
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  理由: {c.reason} ・実行者: {c.recordedBy.displayName}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
