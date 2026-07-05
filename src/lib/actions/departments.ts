"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function createDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "TRANSPORT");
  if (!name) return;

  await prisma.department.create({
    data: { name, type: type as "TRANSPORT" | "PROCESSING" },
  });
  revalidatePath("/admin/departments");
}

export async function updateDepartment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "TRANSPORT");
  if (!id || !name) return;

  await prisma.department.update({
    where: { id },
    data: { name, type: type as "TRANSPORT" | "PROCESSING" },
  });
  revalidatePath("/admin/departments");
}

export async function toggleDepartmentActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  await prisma.department.update({
    where: { id },
    data: { isActive: nextActive },
  });
  revalidatePath("/admin/departments");
}
