"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";
import { cleanseOperatorName } from "@/lib/cleansing";
import { isUniqueViolation, withDbRetry } from "@/lib/db-utils";

// 会社メールを持たない作業者もいるため、メール形式は強制しない（ただし禁止もしない。
// 既存アカウントがメール形式のIDのまま運用されていても編集できるよう@も許容する）。
// 半角英数字・アンダースコア・ハイフン・ドット・@のみ、3〜32文字の管理者発行IDとする
const LOGIN_ID_RE = /^[A-Za-z0-9_.@-]{3,32}$/;

function getDepartmentIds(formData: FormData): string[] {
  return formData.getAll("departmentIds").map(String).filter(Boolean);
}

// 部署割当は物理削除せず isActive で無効化する（誰がいつどの部署に属していたかの監査証跡を残す）。
// 呼び出し側のトランザクション（tx）内で使えるよう、クライアントを引数で受け取る
async function syncDepartmentAssignments(
  db: Prisma.TransactionClient,
  userId: string,
  departmentIds: string[],
) {
  await db.operatorDepartment.updateMany({
    where: { userId, departmentId: { notIn: departmentIds } },
    data: { isActive: false },
  });
  for (const departmentId of departmentIds) {
    await db.operatorDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      update: { isActive: true },
      create: { userId, departmentId },
    });
  }
}

async function otherActiveAdminCount(db: Prisma.TransactionClient, excludeUserId: string): Promise<number> {
  return db.user.count({
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

  try {
    // アカウント作成と部署割当をひとつのトランザクションにまとめる
    // （割当だけ失敗して部署なしアカウントが残る中途半端な状態を防ぐ）
    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { loginId, displayName, passwordHash, role },
        });
        await syncDepartmentAssignments(tx, user.id, departmentIds);
      }),
    );
  } catch (e) {
    if (isUniqueViolation(e)) redirect("/admin/accounts?error=duplicate_login_id");
    throw e;
  }

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?ok=created");
}

// アカウント一覧の一括保存。画面右下の共通「変更を保存」ボタンから、全行分をまとめて送信する。
// 先に全行の形式検証とパスワードハッシュ化を済ませてから1つのトランザクションで書き込み、
// 途中エラーで「一部の行だけ保存された」中途半端な状態にならないようにする（全or無）
export async function saveAccounts(formData: FormData) {
  await requireAdmin();
  const userIds = formData.getAll("userIds").map(String).filter(Boolean);

  const updates: {
    id: string;
    loginId: string;
    displayName: string;
    role: "ADMIN" | "STAFF";
    passwordHash: string | null;
    departmentIds: string[];
  }[] = [];
  for (const id of userIds) {
    const loginId = String(formData.get(`loginId_${id}`) ?? "").trim().toLowerCase();
    const displayName = cleanseOperatorName(String(formData.get(`displayName_${id}`) ?? ""));
    const role = formData.get(`role_${id}`) === "ADMIN" ? ("ADMIN" as const) : ("STAFF" as const);
    const newPassword = String(formData.get(`password_${id}`) ?? "");
    const departmentIds = formData.getAll(`departmentIds_${id}`).map(String).filter(Boolean);

    if (!displayName) redirect("/admin/accounts?error=invalid_name");
    if (!LOGIN_ID_RE.test(loginId)) redirect("/admin/accounts?error=invalid_login_id");
    if (newPassword && newPassword.length < 8) redirect("/admin/accounts?error=weak_password");

    updates.push({
      id,
      loginId,
      displayName,
      role,
      // bcryptは重い処理のためトランザクション外で先に済ませる
      passwordHash: newPassword ? await bcrypt.hash(newPassword, 10) : null,
      departmentIds,
    });
  }

  try {
    await withDbRetry(() =>
      prisma.$transaction(
        async (tx) => {
          for (const u of updates) {
            const target = await tx.user.findUnique({ where: { id: u.id } });
            if (!target) redirect("/admin/accounts?error=not_found");

            // 最後の有効な管理者を一般権限へ降格させると誰も管理できなくなるため拒否する。
            // トランザクション内のカウントは同一保存内で先に処理した降格も反映するため、
            // 「複数の管理者を同時に全員降格」もまとめて弾ける
            if (
              target.role === "ADMIN" &&
              target.isActive &&
              u.role !== "ADMIN" &&
              (await otherActiveAdminCount(tx, u.id)) === 0
            ) {
              redirect("/admin/accounts?error=last_admin");
            }

            await tx.user.update({
              where: { id: u.id },
              data: {
                loginId: u.loginId,
                displayName: u.displayName,
                role: u.role,
                ...(u.passwordHash ? { passwordHash: u.passwordHash } : {}),
              },
            });
            await syncDepartmentAssignments(tx, u.id, u.departmentIds);
          }
        },
        // アカウント数×部署割当数ぶんの往復が発生するため、既定5秒より長いタイムアウトを確保する
        { timeout: 30000 },
      ),
    );
  } catch (e) {
    if (isUniqueViolation(e)) redirect("/admin/accounts?error=duplicate_login_id");
    throw e;
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
    if (target.role === "ADMIN" && target.isActive && (await otherActiveAdminCount(prisma, id)) === 0) {
      redirect("/admin/accounts?error=last_admin");
    }
  }

  await prisma.user.update({ where: { id }, data: { isActive: nextActive } });
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts");
}

// アカウントの物理削除。台帳・監査ログ・エクスポート履歴から参照されているアカウントは
// 「誰が記録したか」の法的証跡が失われるため削除できない（無効化を使う）。
// 参照が一切ないアカウントのみ、部署割当ごと削除する
export async function deleteAccount(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  const target = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          recordedTransactions: true,
          approvedTransactions: true,
          exportRequests: true,
          siteMergeLogs: true,
        },
      },
    },
  });
  if (!target) redirect("/admin/accounts?error=not_found");

  const referenceCount =
    target._count.recordedTransactions +
    target._count.approvedTransactions +
    target._count.exportRequests +
    target._count.siteMergeLogs;
  if (referenceCount > 0) {
    redirect("/admin/accounts?error=has_records");
  }

  // 最後の有効な管理者の削除はロックアウトになるため拒否する
  if (target.role === "ADMIN" && target.isActive && (await otherActiveAdminCount(prisma, id)) === 0) {
    redirect("/admin/accounts?error=last_admin");
  }

  try {
    await prisma.$transaction([
      prisma.operatorDepartment.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
  } catch (e) {
    // カウント確認と削除の間に記録が入った場合は外部キー制約(P2003)で止まる
    if ((e as { code?: string }).code === "P2003") redirect("/admin/accounts?error=has_records");
    throw e;
  }
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?ok=deleted");
}
