import { prisma } from "@/lib/prisma";

type DisplayRow = {
  key: string;
  label: string;
  isChild: boolean;
  available: number;
  current: number;
  max: number;
  rate: number;
};

function rateColor(rate: number): string {
  if (rate >= 90) return "bg-red-500";
  if (rate >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export default async function BargeStatusPage() {
  const [barges, standaloneVessels] = await Promise.all([
    prisma.barge.findMany({
      orderBy: { name: "asc" },
      include: {
        vessels: {
          where: { status: "ACTIVE", showInList: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.vessel.findMany({
      where: { status: "ACTIVE", showInList: true, bargeId: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: DisplayRow[] = [];

  for (const barge of barges) {
    if (barge.vessels.length === 0) continue;
    const current = barge.vessels.reduce((sum, v) => sum + Number(v.currentBalance), 0);
    const max = barge.vessels.reduce((sum, v) => sum + Number(v.maxCapacity), 0);
    rows.push({
      key: barge.id,
      label: barge.name,
      isChild: false,
      available: max - current,
      current,
      max,
      rate: max > 0 ? (current / max) * 100 : 0,
    });
    if (barge.displayMode === "INDIVIDUAL") {
      for (const v of barge.vessels) {
        const c = Number(v.currentBalance);
        const m = Number(v.maxCapacity);
        rows.push({
          key: v.id,
          label: v.name,
          isChild: true,
          available: m - c,
          current: c,
          max: m,
          rate: m > 0 ? (c / m) * 100 : 0,
        });
      }
    }
  }

  for (const v of standaloneVessels) {
    const c = Number(v.currentBalance);
    const m = Number(v.maxCapacity);
    rows.push({
      key: v.id,
      label: v.name,
      isChild: false,
      available: m - c,
      current: c,
      max: m,
      rate: m > 0 ? (c / m) * 100 : 0,
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">
          バージ残量一覧
        </h2>
        <span className="text-xs text-zinc-400">単位: kL</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          まだバージ・タンクが登録されていません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
                <th className="px-2 py-2 font-medium whitespace-nowrap sm:px-4">バージ</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap sm:px-4">受入可能</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap sm:px-4">現在量</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap sm:px-4">容量</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap sm:px-4">積載率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-2 py-2 whitespace-nowrap sm:px-4">
                    {row.isChild ? (
                      <span className="ml-4 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-medium text-zinc-600 sm:ml-6 dark:bg-zinc-800 dark:text-zinc-300">
                        {row.label}
                      </span>
                    ) : (
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">{row.label}</span>
                    )}
                  </td>
                  <td
                    className={`px-2 py-2 tabular-nums whitespace-nowrap sm:px-4 ${
                      row.isChild
                        ? "text-zinc-500 dark:text-zinc-400"
                        : row.available <= 0
                          ? "font-semibold text-red-600 dark:text-red-400"
                          : "font-semibold text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {row.available.toFixed(1)}
                  </td>
                  <td
                    className={`px-2 py-2 tabular-nums whitespace-nowrap sm:px-4 ${
                      row.isChild ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50"
                    }`}
                  >
                    {row.current.toFixed(1)}
                  </td>
                  <td
                    className={`px-2 py-2 tabular-nums whitespace-nowrap sm:px-4 ${
                      row.isChild ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50"
                    }`}
                  >
                    {row.max.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap sm:px-4">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="h-2 w-8 overflow-hidden rounded-full bg-zinc-100 sm:w-24 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${rateColor(row.rate)}`}
                          style={{ width: `${Math.min(row.rate, 100)}%` }}
                        />
                      </div>
                      <span
                        className={`tabular-nums ${
                          row.isChild ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50"
                        }`}
                      >
                        {row.rate.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
