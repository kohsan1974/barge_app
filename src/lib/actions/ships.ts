"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function createShip(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.ship.create({ data: { name } });
  revalidatePath("/admin/ships");
}

export async function updateShip(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  await prisma.ship.update({ where: { id }, data: { name } });
  revalidatePath("/admin/ships");
}

export async function toggleShipActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  await prisma.ship.update({ where: { id }, data: { isActive: nextActive } });
  revalidatePath("/admin/ships");
}
