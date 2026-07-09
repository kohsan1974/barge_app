"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function createDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "TRANSPORT");
  const requiresTransfer = formData.get("requiresTransfer") === "on";
  if (!name) return;

  await prisma.department.create({
    data: { name, type: type as "TRANSPORT" | "PROCESSING", requiresTransfer },
  });
  revalidatePath("/admin/departments");
}

// 部署一覧の一括保存。画面右下の共通「変更を保存」ボタンから、全行分をまとめて送信する
export async function saveDepartments(formData: FormData) {
  await requireAdmin();
  const departmentIds = formData.getAll("departmentIds").map(String).filter(Boolean);

  for (const id of departmentIds) {
    const name = String(formData.get(`name_${id}`) ?? "").trim();
    const type = String(formData.get(`type_${id}`) ?? "TRANSPORT");
    const requiresTransfer = formData.get(`requiresTransfer_${id}`) === "on";
    if (!name) continue;

    await prisma.department.update({
      where: { id },
      data: { name, type: type as "TRANSPORT" | "PROCESSING", requiresTransfer },
    });
  }
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
