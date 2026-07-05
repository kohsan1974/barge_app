"use server";

import { redirect } from "next/navigation";
import { getAdminUserId } from "@/lib/require-admin";
import { syncAllToSheets } from "@/lib/google-sheets";

export async function runSheetsSync() {
  const adminId = await getAdminUserId();
  if (!adminId) redirect("/admin/export?sheets=forbidden");

  const result = await syncAllToSheets();
  if (result.ok) {
    redirect(`/admin/export?sheets=ok&rows=${result.ledgerRows ?? 0}`);
  }
  redirect(`/admin/export?sheets=error&detail=${encodeURIComponent(result.message.slice(0, 180))}`);
}
