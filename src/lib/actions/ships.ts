"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { isUniqueViolation } from "@/lib/db-utils";

// 現場に本船を追加する。本船マスタは独立の管理画面を持たず、現場マスタの中で
// 名前を入力すると（同名があれば再利用、なければ新規登録して）その現場に紐付ける
export async function addSiteShip(formData: FormData) {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const name = String(formData.get("shipName") ?? "").trim();
  if (!siteId || !name) return;

  let ship = await prisma.ship.findFirst({ where: { name } });
  if (!ship) {
    try {
      ship = await prisma.ship.create({ data: { name } });
    } catch (e) {
      // 同時登録で先に同名が作られた場合(unique制約違反)は既存を使う
      if (!isUniqueViolation(e)) throw e;
      ship = await prisma.ship.findFirst({ where: { name } });
      if (!ship) return;
    }
  } else if (!ship.isActive) {
    ship = await prisma.ship.update({ where: { id: ship.id }, data: { isActive: true } });
  }

  await prisma.siteShip.upsert({
    where: { siteId_shipId: { siteId, shipId: ship.id } },
    update: {},
    create: { siteId, shipId: ship.id },
  });
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 現場からの本船の解除（本船マスタ自体は消さない。台帳の過去データが参照するため）
export async function removeSiteShip(formData: FormData) {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const shipId = String(formData.get("shipId") ?? "");
  if (!siteId || !shipId) return;

  await prisma.siteShip.deleteMany({ where: { siteId, shipId } });
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 台帳から参照されていない本船のみ物理削除できる（管理者向けの後片付け用途。UIからは現状導線なし）
export async function deleteShip(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  const referenceCount = await prisma.tankTransaction.count({ where: { shipId: id } });
  if (referenceCount > 0) {
    redirect("/admin/sites?error=has_transactions");
  }

  try {
    await prisma.$transaction([
      prisma.siteShip.deleteMany({ where: { shipId: id } }),
      prisma.ship.delete({ where: { id } }),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === "P2003") redirect("/admin/sites?error=has_transactions");
    throw e;
  }
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}
