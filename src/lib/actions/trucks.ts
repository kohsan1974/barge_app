"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { isUniqueViolation } from "@/lib/db-utils";

export async function createTruck(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!name || !departmentId) redirect("/admin/vessels?error=invalid_truck");

  try {
    await prisma.truck.create({ data: { name, departmentId } });
  } catch (e) {
    if (isUniqueViolation(e)) redirect("/admin/vessels?error=duplicate_truck");
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/record");
}

export async function updateTruck(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!id || !name || !departmentId) redirect("/admin/vessels?error=invalid_truck");

  try {
    await prisma.truck.update({ where: { id }, data: { name, departmentId } });
  } catch (e) {
    if (isUniqueViolation(e)) redirect("/admin/vessels?error=duplicate_truck");
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/record");
}

export async function toggleTruckActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  await prisma.truck.update({ where: { id }, data: { isActive: nextActive } });
  revalidatePath("/admin/vessels");
  revalidatePath("/record");
}

// 台帳から参照されていないトラックのみ物理削除できる
export async function deleteTruck(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  const referenceCount = await prisma.tankTransaction.count({ where: { truckId: id } });
  if (referenceCount > 0) {
    redirect("/admin/vessels?error=has_transactions");
  }

  try {
    await prisma.truck.delete({ where: { id } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2003") redirect("/admin/vessels?error=has_transactions");
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/record");
}
