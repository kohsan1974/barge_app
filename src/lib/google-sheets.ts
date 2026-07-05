import { JWT } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { buildLedgerRows, LEDGER_HEADER } from "@/lib/ledger-export";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const LEDGER_TAB = "台帳";
const TANKS_TAB = "タンク残量";

type SheetsClient = { jwt: JWT; sheetId: string };

function getClient(): SheetsClient | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Vercelの環境変数では改行が \n という2文字で保存されるため実際の改行に戻す
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!email || !key || !sheetId) return null;

  const jwt = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { jwt, sheetId };
}

export function isSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_SHEET_ID,
  );
}

async function ensureTabs(client: SheetsClient, titles: string[]) {
  const meta = await client.jwt.request<{
    sheets?: { properties?: { title?: string } }[];
  }>({
    url: `${SHEETS_API}/${client.sheetId}?fields=sheets(properties(title))`,
  });
  const existing = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean),
  );
  const missing = titles.filter((t) => !existing.has(t));
  if (missing.length === 0) return;

  await client.jwt.request({
    url: `${SHEETS_API}/${client.sheetId}:batchUpdate`,
    method: "POST",
    data: {
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    },
  });
}

async function writeTab(client: SheetsClient, tab: string, values: (string | number)[][]) {
  await client.jwt.request({
    url: `${SHEETS_API}/${client.sheetId}/values/${encodeURIComponent(tab)}:clear`,
    method: "POST",
  });
  await client.jwt.request({
    url: `${SHEETS_API}/${client.sheetId}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`,
    method: "PUT",
    data: { values },
  });
}

export type SheetsSyncResult = {
  ok: boolean;
  message: string;
  ledgerRows?: number;
};

// 台帳全件とタンク残量をGoogle Sheetsへミラーリングする（閲覧用・オフサイトバックアップ用）
// スプレッドシート側は常にDBの写しであり、正データはあくまでPostgreSQL
export async function syncAllToSheets(): Promise<SheetsSyncResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, message: "Google Sheets連携が未設定です（環境変数を設定してください）" };
  }

  try {
    await ensureTabs(client, [LEDGER_TAB, TANKS_TAB]);

    const rows = await buildLedgerRows({
      from: new Date("1970-01-01"),
      to: new Date("2100-01-01"),
    });
    await writeTab(client, LEDGER_TAB, [LEDGER_HEADER, ...rows]);

    const vessels = await prisma.vessel.findMany({
      orderBy: { name: "asc" },
      include: { barge: true },
    });
    vessels.sort((a, b) =>
      `${a.barge?.name ?? ""}${a.name}`.localeCompare(`${b.barge?.name ?? ""}${b.name}`, "ja"),
    );
    const syncedAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const tankValues: (string | number)[][] = [
      ["バージ", "タンク名", "受入可能量(kL)", "現在量(kL)", "最大容量(kL)", "積載率(%)", "状態", "最終同期(JST)"],
      ...vessels.map((v) => {
        const max = Number(v.maxCapacity);
        const cur = Number(v.currentBalance);
        return [
          v.barge?.name ?? "",
          v.name,
          (max - cur).toFixed(2),
          cur.toFixed(2),
          max.toFixed(1),
          max > 0 ? ((cur / max) * 100).toFixed(0) : "0",
          v.status === "ACTIVE" ? "稼働中" : "廃止済み",
          syncedAt,
        ];
      }),
    ];
    await writeTab(client, TANKS_TAB, tankValues);

    return {
      ok: true,
      message: `同期しました（台帳 ${rows.length}件）`,
      ledgerRows: rows.length,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `同期に失敗しました: ${detail}` };
  }
}
