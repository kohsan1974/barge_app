"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

function parseDisplayMode(value: unknown): "INDIVIDUAL" | "TOTAL" {
  return value === "TOTAL" ? "TOTAL" : "INDIVIDUAL";
}

export async function createBarge(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const displayMode = parseDisplayMode(formData.get("displayMode"));
  if (!name) return;

  await prisma.barge.create({ data: { name, displayMode } });
  revalidatePath("/admin/barges");
  revalidatePath("/");
}

export async function updateBarge(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const displayMode = parseDisplayMode(formData.get("displayMode"));
  if (!id || !name) return;

  await prisma.barge.update({ where: { id }, data: { name, displayMode } });
  revalidatePath("/admin/barges");
  revalidatePath("/");
}

export async function deleteBarge(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  // 所属タンクが残っているバージを消すと表示上の行き場がなくなるため拒否する
  const vesselCount = await prisma.vessel.count({ where: { bargeId: id } });
  if (vesselCount > 0) {
    redirect("/admin/barges?error=has_vessels");
  }

  await prisma.barge.delete({ where: { id } });
  revalidatePath("/admin/barges");
  revalidatePath("/");
}
