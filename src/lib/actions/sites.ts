"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { cleanseSiteName } from "@/lib/cleansing";

export async function createSite(formData: FormData) {
  await requireAdmin();
  const name = cleanseSiteName(String(formData.get("name") ?? ""));
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!name || !departmentId) return;

  await prisma.site.create({ data: { name, departmentId } });
  revalidatePath("/admin/sites");
}

export async function updateSite(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const name = cleanseSiteName(String(formData.get("name") ?? ""));
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!id || !name || !departmentId) return;

  await prisma.site.update({ where: { id }, data: { name, departmentId } });
  revalidatePath("/admin/sites");
}

export async function toggleSiteActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  await prisma.site.update({ where: { id }, data: { isActive: nextActive } });
  revalidatePath("/admin/sites");
}
