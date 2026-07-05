"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { cleanseOperatorName } from "@/lib/cleansing";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getDepartmentIds(formData: FormData): string[] {
  return formData.getAll("departmentIds").map(String).filter(Boolean);
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// 部署割当は物理削除せず isActive で無効化する（誰がいつどの部署に属していたかの監査証跡を残す）
async function syncDepartmentAssignments(userId: string, departmentIds: string[]) {
  await prisma.$transaction([
    prisma.operatorDepartment.updateMany({
      where: { userId, departmentId: { notIn: departmentIds } },
      data: { isActive: false },
    }),
    ...departmentIds.map((departmentId) =>
      prisma.operatorDepartment.upsert({
        where: { userId_departmentId: { userId, departmentId } },
        update: { isActive: true },
        create: { userId, departmentId },
      }),
    ),
  ]);
}

async function otherActiveAdminCount(excludeUserId: string): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: excludeUserId } },
  });
}

export async function createAccount(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = cleanseOperatorName(String(formData.get("displayName") ?? ""));
  const role = formData.get("role") === "ADMIN" ? ("ADMIN" as const) : ("STAFF" as const);
  const password = String(formData.get("password") ?? "");
  const departmentIds = getDepartmentIds(formData);

  if (!EMAIL_RE.test(email)) redirect("/admin/accounts?error=invalid_email");
  if (!displayName) redirect("/admin/accounts?error=invalid_name");
  if (password.length < 8) redirect("/admin/accounts?error=weak_password");

  const passwordHash = await bcrypt.hash(password, 10);

  let errorCode: string | null = null;
  try {
    const user = await prisma.user.create({
      data: { email, displayName, passwordHash, role },
    });
    await syncDepartmentAssignments(user.id, departmentIds);
  } catch (e) {
    if (isUniqueViolation(e)) errorCode = "duplicate_email";
    else throw e;
  }
  if (errorCode) redirect(`/admin/accounts?error=${errorCode}`);

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?ok=created");
}

export async function updateAccount(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const displayName = cleanseOperatorName(String(formData.get("displayName") ?? ""));
  const role = formData.get("role") === "ADMIN" ? ("ADMIN" as const) : ("STAFF" as const);
  const newPassword = String(formData.get("password") ?? "");
  const departmentIds = getDepartmentIds(formData);

  if (!id || !displayName) redirect("/admin/accounts?error=invalid_name");
  if (newPassword && newPassword.length < 8) redirect("/admin/accounts?error=weak_password");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) redirect("/admin/accounts?error=not_found");

  // 最後の有効な管理者を一般権限へ降格させると誰も管理できなくなるため拒否する
  if (
    target.role === "ADMIN" &&
    target.isActive &&
    role !== "ADMIN" &&
    (await otherActiveAdminCount(id)) === 0
  ) {
    redirect("/admin/accounts?error=last_admin");
  }

  await prisma.user.update({
    where: { id },
    data: {
      displayName,
      role,
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });
  await syncDepartmentAssignments(id, departmentIds);

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?ok=updated");
}

export async function toggleAccountActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  if (!nextActive) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) redirect("/admin/accounts?error=not_found");
    // 最後の有効な管理者の無効化はロックアウトになるため拒否する
    if (target.role === "ADMIN" && target.isActive && (await otherActiveAdminCount(id)) === 0) {
      redirect("/admin/accounts?error=last_admin");
    }
  }

  await prisma.user.update({ where: { id }, data: { isActive: nextActive } });
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts");
}
