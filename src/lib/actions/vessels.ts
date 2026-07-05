"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function createVessel(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const maxCapacity = Number(formData.get("maxCapacity"));
  const bargeId = String(formData.get("bargeId") ?? "") || null;
  const showInList = formData.get("showInList") === "on";
  if (!name || !Number.isFinite(maxCapacity) || maxCapacity <= 0) return;

  await prisma.vessel.create({ data: { name, maxCapacity, bargeId, showInList } });
  revalidatePath("/admin/vessels");
  revalidatePath("/");
}

export async function updateVessel(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const maxCapacity = Number(formData.get("maxCapacity"));
  const bargeId = String(formData.get("bargeId") ?? "") || null;
  const showInList = formData.get("showInList") === "on";
  if (!id || !name || !Number.isFinite(maxCapacity) || maxCapacity <= 0) return;

  const current = await prisma.vessel.findUnique({ where: { id } });
  if (!current) redirect("/admin/vessels?error=not_found");

  // 台帳上の現在残量より小さい最大容量に変更すると、残量>容量という矛盾した状態になるため拒否する
  if (maxCapacity < Number(current.currentBalance)) {
    redirect("/admin/vessels?error=capacity_below_balance");
  }

  await prisma.vessel.update({ where: { id }, data: { name, maxCapacity, bargeId, showInList } });
  revalidatePath("/admin/vessels");
  revalidatePath("/");
  redirect("/admin/vessels");
}

// タンクに内容物を登録する。内容物マスタに同名がなければ自動作成して紐づける
export async function addVesselContent(formData: FormData) {
  await requireAdmin();
  const vesselId = String(formData.get("vesselId") ?? "");
  const name = String(formData.get("contentName") ?? "").trim();
  if (!vesselId || !name) return;

  let itemType = await prisma.itemType.findFirst({ where: { name } });
  if (!itemType) {
    itemType = await prisma.itemType.create({ data: { name } });
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
