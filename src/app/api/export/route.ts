import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUserId } from "@/lib/require-admin";
import { buildLedgerCsv } from "@/lib/ledger-export";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 期間指定で台帳CSVをダウンロードする。実行そのものも export_history に証跡として残す
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId();
  if (!adminId) {
    return new Response("管理者権限が必要です", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const all = sp.get("all") === "1";
  const fromRaw = sp.get("from") ?? "";
  const toRaw = sp.get("to") ?? "";
  const vesselId = sp.get("vesselId") || null;

  let from: Date;
  let to: Date;
  if (all) {
    from = new Date("1970-01-01");
    to = new Date("2100-01-01");
  } else {
    if (!DATE_RE.test(fromRaw) || !DATE_RE.test(toRaw)) {
      return new Response("期間の指定が正しくありません", { status: 400 });
    }
    from = new Date(fromRaw);
    to = new Date(toRaw);
    if (from > to) {
      return new Response("開始日は終了日以前にしてください", { status: 400 });
    }
  }

  const { csv, hash, count } = await buildLedgerCsv({ from, to, vesselId });

  await prisma.exportHistory.create({
    data: {
      requestedById: adminId,
      periodStart: from,
      periodEnd: to,
      filterJson: { vesselId, all, rowCount: count },
      format: "csv",
      fileHash: hash,
    },
  });

  const label = all
    ? "all"
    : `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger_${label}.csv"`,
      "X-Content-Hash": hash,
    },
  });
}
