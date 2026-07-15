import { prisma } from "@/lib/prisma";

// keep-warm用の軽量エンドポイント。Neonの自動サスペンドを避けるため、
// 稼働時間帯に外部cron（例: cron-job.org）から数分おきに叩いてDBを温めておく。
// 認証不要（SELECT 1 のみで副作用なし）。proxy.ts のミドルウェアからも除外している
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, ms: Date.now() - start });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
