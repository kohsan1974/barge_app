import { prisma } from "@/lib/prisma";

type DisplayRow = {
  key: string;
  label: string;
  isChild: boolean;
  available: number;
  max: number;
  rate: number;
  contents: string[];
};

function rateColor(rate: number): string {
  if (rate >= 90) return "bg-red-500";
  if (rate >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export default async function BargeStatusPage() {
  const contentsInclude = {
    allowedContents: {
      where: { itemType: { isActive: true } },
      include: { itemType: true },
      orderBy: { itemType: { name: "asc" } },
    },
  } as const;

  const [barges, standaloneVessels] = await Promise.all([
    prisma.barge.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: {
        vessels: {
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" },
          include: contentsInclude,
        },
      },
    }),
    prisma.vessel.findMany({
      where: { status: "ACTIVE", bargeId: null },
      orderBy: { name: "asc" },
      include: contentsInclude,
    }),
  ]);

  const rows: DisplayRow[] = [];

  for (const barge of barges) {
    if (barge.vessels.length === 0) continue;
    const current = barge.vessels.reduce((sum, v) => sum + Number(v.currentBalance), 0);
    const max = barge.vessels.reduce((sum, v) => sum + Number(v.maxCapacity), 0);
    // バージ行の内容物は「総量のみ表示」の場合だけ配下タンクの和集合を表示する。
    // タンクをツリー表示する場合は各タンク行に個別表示されるため、バージ行では二重表示を避ける
    const bargeContents = barge.showTotalOnly
      ? [...new Set(barge.vessels.flatMap((v) => v.allowedContents.map((l) => l.itemType.name)))]
      : [];
    rows.push({
      key: barge.id,
      label: barge.name,
      isChild: false,
      available: max - current,
      max,
      rate: max > 0 ? (current / max) * 100 : 0,
      contents: bargeContents,
    });
    // 「総量のみ表示」のバージはタンクのツリー行を出さない
    if (!barge.showTotalOnly) {
      for (const v of barge.vessels) {
        if (!v.showIndividually) continue;
        const c = Number(v.currentBalance);
        const m = Number(v.maxCapacity);
        rows.push({
          key: v.id,
          label: v.name,
          isChild: true,
          available: m - c,
          max: m,
          rate: m > 0 ? (c / m) * 100 : 0,
          contents: v.allowedContents.map((l) => l.itemType.name),
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
      max: m,
      rate: m > 0 ? (c / m) * 100 : 0,
      contents: v.allowedContents.map((l) => l.itemType.name),
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
                <th className="px-2 py-1.5 font-medium whitespace-nowrap sm:px-4">バージ</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap sm:px-4">受入可能</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap sm:px-4">最大容量</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap sm:px-4">積載率</th>
                <th className="px-2 py-1.5 font-medium whitespace-nowrap sm:px-4">内容物</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className={`px-2 whitespace-nowrap sm:px-4 ${row.isChild ? "py-0.5" : "py-1.5"}`}>
                    {row.isChild ? (
                      <span className="ml-4 inline-flex h-5 min-w-5 items-center justify-center rounded bg-zinc-100 px-1 text-xs font-medium text-zinc-600 sm:ml-6 dark:bg-zinc-800 dark:text-zinc-300">
                        {row.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-50">
                        {row.label}
                        <span
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${rateColor(row.rate)}`}
                          aria-hidden="true"
                        />
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-2 text-right tabular-nums whitespace-nowrap sm:px-4 ${row.isChild ? "py-0.5" : "py-1.5"} ${
                      row.isChild
                        ? "text-xs text-zinc-500 dark:text-zinc-400"
                        : row.available <= 0
                          ? "font-semibold text-red-600 dark:text-red-400"
                          : "font-semibold text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {row.available.toFixed(1)}
                  </td>
                  <td
                    className={`px-2 text-right tabular-nums whitespace-nowrap sm:px-4 ${
                      row.isChild
                        ? "py-0.5 text-xs text-zinc-500 dark:text-zinc-400"
                        : "py-1.5 text-zinc-900 dark:text-zinc-50"
                    }`}
                  >
                    {row.max.toFixed(1)}
                  </td>
                  <td className={`px-2 whitespace-nowrap sm:px-4 ${row.isChild ? "py-0.5" : "py-1.5"}`}>
                    <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                      <div className={`overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 ${row.isChild ? "h-1.5 w-6 sm:w-16" : "h-2 w-8 sm:w-24"}`}>
                        <div
                          className={`h-full rounded-full ${rateColor(row.rate)}`}
                          style={{ width: `${Math.min(row.rate, 100)}%` }}
                        />
                      </div>
                      <span
                        className={`tabular-nums ${
                          row.isChild ? "text-xs text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50"
                        }`}
                      >
                        {row.rate.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td
                    className={`px-2 sm:px-4 ${
                      row.isChild
                        ? "py-0.5 text-xs text-zinc-500 dark:text-zinc-400"
                        : "py-1.5 text-xs text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {row.contents.length > 0 ? row.contents.join("、") : "—"}
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
