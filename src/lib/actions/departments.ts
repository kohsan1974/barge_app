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

// 都度保存（オートセーブ）用: 部署1件の1項目だけを更新する。結果を返す（redirectしない）
export async function updateDepartmentField(
  id: string,
  field: "name" | "type",
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!id) return { ok: false, error: "対象の部署が見つかりません" };

  if (field === "name") {
    const name = String(value).trim();
    if (!name) return { ok: false, error: "部署名を入力してください" };
    await prisma.department.update({ where: { id }, data: { name } });
  } else {
    if (value !== "TRANSPORT" && value !== "PROCESSING") {
      return { ok: false, error: "種別が正しくありません" };
    }
    await prisma.department.update({ where: { id }, data: { type: value } });
  }
  revalidatePath("/admin/departments");
  return { ok: true };
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
