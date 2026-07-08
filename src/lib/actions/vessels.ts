"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { isUniqueViolation } from "@/lib/db-utils";

export async function createVessel(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const maxCapacity = Number(formData.get("maxCapacity"));
  const bargeId = String(formData.get("bargeId") ?? "") || null;
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  if (!name || !Number.isFinite(maxCapacity) || maxCapacity <= 0) return;

  try {
    await prisma.vessel.create({ data: { name, maxCapacity, bargeId, departmentId } });
  } catch (e) {
    if (isUniqueViolation(e)) redirect("/admin/vessels?error=duplicate_tank");
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/barges");
  revalidatePath("/record");
}

// タンクの編集（名前・容量・ツリー表示）はバージ単位の一括保存（saveBargeSettings）に統合済み

// タンクの物理削除。台帳から参照されているタンクは法的証跡が失われるため削除できない（廃止を使う）
export async function deleteVessel(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  const transactionCount = await prisma.tankTransaction.count({ where: { vesselId: id } });
  if (transactionCount > 0) {
    redirect("/admin/vessels?error=has_transactions");
  }

  try {
    await prisma.$transaction([
      prisma.vesselItemType.deleteMany({ where: { vesselId: id } }),
      prisma.vessel.delete({ where: { id } }),
    ]);
  } catch (e) {
    // カウント確認と削除の間に記録が入った場合は外部キー制約(P2003)で止まる
    if ((e as { code?: string }).code === "P2003") {
      redirect("/admin/vessels?error=has_transactions");
    }
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/barges");
  revalidatePath("/record");
}

// タンクに内容物を登録する。内容物マスタに同名がなければ自動作成して紐づける
export async function addVesselContent(formData: FormData) {
  await requireAdmin();
  const vesselId = String(formData.get("vesselId") ?? "");
  const name = String(formData.get("contentName") ?? "").trim();
  if (!vesselId || !name) return;

  let itemType = await prisma.itemType.findFirst({ where: { name } });
  if (!itemType) {
    try {
      itemType = await prisma.itemType.create({ data: { name } });
    } catch (e) {
      // 同時登録で先に同名が作られた場合(unique制約違反)は既存を使う
      if (!isUniqueViolation(e)) throw e;
      itemType = await prisma.itemType.findFirst({ where: { name } });
      if (!itemType) return;
    }
  } else if (!itemType.isActive) {
    itemType = await prisma.itemType.update({ where: { id: itemType.id }, data: { isActive: true } });
  }

  await prisma.vesselItemType.upsert({
    where: { vesselId_itemTypeId: { vesselId, itemTypeId: itemType.id } },
    update: {},
    create: { vesselId, itemTypeId: itemType.id },
  });

  revalidatePath("/admin/vessels");
  revalidatePath("/record");
}

// タンクからの内容物登録解除。内容物マスタ自体は消さない（過去の台帳が参照しているため）
export async function removeVesselContent(formData: FormData) {
  await requireAdmin();
  const vesselId = String(formData.get("vesselId") ?? "");
  const itemTypeId = String(formData.get("itemTypeId") ?? "");
  if (!vesselId || !itemTypeId) return;

  await prisma.vesselItemType.deleteMany({ where: { vesselId, itemTypeId } });
  revalidatePath("/admin/vessels");
  revalidatePath("/record");
}

export async function setVesselStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextStatus = String(formData.get("nextStatus"));
  if (!id || (nextStatus !== "ACTIVE" && nextStatus !== "DECOMMISSIONED")) return;

  await prisma.vessel.update({
    where: { id },
    data: {
      status: nextStatus,
      decommissionedAt: nextStatus === "DECOMMISSIONED" ? new Date() : null,
    },
  });
  revalidatePath("/admin/vessels");
}
