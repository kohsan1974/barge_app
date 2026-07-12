"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-utils";

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

// 部署一覧の一括保存。画面右下の共通「変更を保存」ボタンから、全行分をまとめて送信する。
// 先に全行を検証してから1つのトランザクションで書き込み、途中エラーで
// 「一部の行だけ保存された」中途半端な状態にならないようにする（全or無）
export async function saveDepartments(formData: FormData) {
  await requireAdmin();
  const departmentIds = formData.getAll("departmentIds").map(String).filter(Boolean);

  const updates = departmentIds
    .map((id) => ({
      id,
      name: String(formData.get(`name_${id}`) ?? "").trim(),
      type: String(formData.get(`type_${id}`) ?? "TRANSPORT") as "TRANSPORT" | "PROCESSING",
    }))
    .filter((u) => u.name !== "");

  await withDbRetry(() =>
    prisma.$transaction(
      updates.map((u) =>
        prisma.department.update({ where: { id: u.id }, data: { name: u.name, type: u.type } }),
      ),
    ),
  );
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
