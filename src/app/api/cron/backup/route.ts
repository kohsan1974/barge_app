import { NextRequest } from "next/server";
import { isSheetsConfigured, syncAllToSheets } from "@/lib/google-sheets";

// Vercel Cron から毎日呼ばれる自動バックアップ。
// Vercelは CRON_SECRET 環境変数を設定すると Authorization: Bearer <CRON_SECRET> を自動付与する
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isSheetsConfigured()) {
    return Response.json({ ok: false, message: "Google Sheets連携が未設定のためスキップしました" });
  }

  const result = await syncAllToSheets();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
