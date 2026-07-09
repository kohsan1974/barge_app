"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { cleanseOperatorName } from "@/lib/cleansing";

// 会社メールを持たない作業者もいるため、メール形式は強制しない（ただし禁止もしない。
// 既存アカウントがメール形式のIDのまま運用されていても編集できるよう@も許容する）。
// 半角英数字・アンダースコア・ハイフン・ドット・@のみ、3〜32文字の管理者発行IDとする
const LOGIN_ID_RE = /^[A-Za-z0-9_.@-]{3,32}$/;

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
  const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
  const displayName = cleanseOperatorName(String(formData.get("displayName") ?? ""));
  const role = formData.get("role") === "ADMIN" ? ("ADMIN" as const) : ("STAFF" as const);
  const password = String(formData.get("password") ?? "");
  const departmentIds = getDepartmentIds(formData);

  if (!LOGIN_ID_RE.test(loginId)) redirect("/admin/accounts?error=invalid_login_id");
  if (!displayName) redirect("/admin/accounts?error=invalid_name");
  if (password.length < 8) redirect("/admin/accounts?error=weak_password");

  const passwordHash = await bcrypt.hash(password, 10);

  let errorCode: string | null = null;
  try {
    const user = await prisma.user.create({
      data: { loginId, displayName, passwordHash, role },
    });
    await syncDepartmentAssignments(user.id, departmentIds);
  } catch (e) {
    if (isUniqueViolation(e)) errorCode = "duplicate_login_id";
    else throw e;
  }
  if (errorCode) redirect(`/admin/accounts?error=${errorCode}`);

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?ok=created");
}

// アカウント一覧の一括保存。画面右下の共通「変更を保存」ボタンから、全行分をまとめて送信する
export async function saveAccounts(formData: FormData) {
  await requireAdmin();
  const userIds = formData.getAll("userIds").map(String).filter(Boolean);

  for (const id of userIds) {
    const loginId = String(formData.get(`loginId_${id}`) ?? "").trim().toLowerCase();
    const displayName = cleanseOperatorName(String(formData.get(`displayName_${id}`) ?? ""));
    const role = formData.get(`role_${id}`) === "ADMIN" ? ("ADMIN" as const) : ("STAFF" as const);
    const newPassword = String(formData.get(`password_${id}`) ?? "");
    const departmentIds = formData.getAll(`departmentIds_${id}`).map(String).filter(Boolean);

    if (!displayName) redirect("/admin/accounts?error=invalid_name");
    if (!LOGIN_ID_RE.test(loginId)) redirect("/admin/accounts?error=invalid_login_id");
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

    try {
      await prisma.user.update({
        where: { id },
        data: {
          loginId,
          displayName,
          role,
          ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) redirect("/admin/accounts?error=duplicate_login_id");
      throw e;
    }
    await syncDepartmentAssignments(id, departmentIds);
  }

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
