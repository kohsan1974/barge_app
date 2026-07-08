import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export const LEDGER_HEADER = [
  "ID",
  "伝票ID",
  "業務日",
  "記録日時(JST)",
  "種別",
  "タンク",
  "内容物",
  "数量(kL)",
  "処理後残量(kL)",
  "部署",
  "現場",
  "本船",
  "トラック",
  "記録者",
  "承認者",
  "理由",
  "実測値(kL)",
  "補正前システム値(kL)",
  "訂正対象ID",
];

const TYPE_LABEL: Record<string, string> = {
  RECEIVE: "搬入",
  PROCESS: "処理",
  CALIBRATION: "残量調整",
  CORRECTION: "訂正",
};

export type LedgerFilter = {
  from: Date;
  to: Date;
  vesselId?: string | null;
};

// 台帳を公的提出・バックアップ用の行データに変換する（CSVとGoogle Sheetsで共用）
export async function buildLedgerRows(filter: LedgerFilter): Promise<string[][]> {
  const transactions = await prisma.tankTransaction.findMany({
    where: {
      businessDate: { gte: filter.from, lte: filter.to },
      ...(filter.vesselId ? { vesselId: filter.vesselId } : {}),
    },
    orderBy: [{ businessDate: "asc" }, { createdAt: "asc" }],
    include: {
      vessel: { include: { barge: true } },
      itemType: true,
      department: true,
      site: true,
      ship: true,
      truck: true,
      recordedBy: true,
      approvedBy: true,
    },
  });

  return transactions.map((t) => [
    t.id,
    t.slipId,
    t.businessDate.toISOString().slice(0, 10),
    t.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
    TYPE_LABEL[t.transactionType] ?? t.transactionType,
    t.vessel.barge ? `${t.vessel.barge.name}-${t.vessel.name}` : t.vessel.name,
    t.itemType?.name ?? "",
    Number(t.quantity).toFixed(2),
    Number(t.balanceAfter).toFixed(2),
    t.department?.name ?? "",
    t.site?.name ?? "",
    t.ship?.name ?? "",
    t.truck?.name ?? "",
    t.recordedBy.displayName,
    t.approvedBy?.displayName ?? "",
    t.reason ?? "",
    t.measuredValue !== null ? Number(t.measuredValue).toFixed(2) : "",
    t.systemValueBefore !== null ? Number(t.systemValueBefore).toFixed(2) : "",
    t.referenceTransactionId ?? "",
  ]);
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Excelで文字化けしないようUTF-8 BOM付きCSVを生成し、改ざん検知用のSHA-256ハッシュを添える
export async function buildLedgerCsv(filter: LedgerFilter) {
  const rows = await buildLedgerRows(filter);
  const lines = [LEDGER_HEADER, ...rows].map((row) => row.map(csvField).join(","));
  const CRLF = String.fromCharCode(13, 10);
  const csv = String.fromCharCode(0xfeff) + lines.join(CRLF) + CRLF;
  const hash = createHash("sha256").update(csv, "utf8").digest("hex");
  return { csv, hash, count: rows.length };
}
