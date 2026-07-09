"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { cleanseSiteName } from "@/lib/cleansing";
import { isUniqueViolation, withDbRetry } from "@/lib/db-utils";

function getDepartmentIds(formData: FormData): string[] {
  return formData.getAll("departmentIds").map(String).filter(Boolean);
}

// 現場の所属部署を差し替える。運用上のルーティング設定に過ぎず（法的証跡は
// TankTransaction.departmentId に記録時点で直接残る）、履歴を残す必要がないため単純に張り替える
async function syncSiteDepartments(siteId: string, departmentIds: string[]) {
  await prisma.$transaction([
    prisma.siteDepartment.deleteMany({
      where: { siteId, departmentId: { notIn: departmentIds } },
    }),
    ...departmentIds.map((departmentId) =>
      prisma.siteDepartment.upsert({
        where: { siteId_departmentId: { siteId, departmentId } },
        update: {},
        create: { siteId, departmentId },
      }),
    ),
  ]);
}

export async function createSite(formData: FormData) {
  await requireAdmin();
  const name = cleanseSiteName(String(formData.get("name") ?? ""));
  const departmentIds = getDepartmentIds(formData);
  if (!name || departmentIds.length === 0) redirect("/admin/sites?error=no_department");

  let siteId: string;
  try {
    const site = await prisma.site.create({ data: { name } });
    siteId = site.id;
  } catch (e) {
    if (isUniqueViolation(e)) redirect("/admin/sites?error=duplicate_site");
    throw e;
  }
  await syncSiteDepartments(siteId, departmentIds);
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 現場一覧の一括保存。画面右下の共通「変更を保存」ボタンから、全行分をまとめて送信する
export async function saveSites(formData: FormData) {
  await requireAdmin();
  const siteIds = formData.getAll("siteIds").map(String).filter(Boolean);

  for (const id of siteIds) {
    const name = cleanseSiteName(String(formData.get(`siteName_${id}`) ?? ""));
    const departmentIds = formData.getAll(`siteDepartmentIds_${id}`).map(String).filter(Boolean);
    if (!name || departmentIds.length === 0) redirect("/admin/sites?error=no_department");

    try {
      await prisma.site.update({ where: { id }, data: { name } });
    } catch (e) {
      if (isUniqueViolation(e)) redirect("/admin/sites?error=duplicate_site");
      throw e;
    }
    await syncSiteDepartments(id, departmentIds);
  }
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

export async function toggleSiteActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  await prisma.site.update({ where: { id }, data: { isActive: nextActive } });
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 重複した現場を1つに統合する。過去の台帳記録の現場参照(siteIdのみDBトリガーで訂正可)を
// 統合先に付け替えたうえで、統合元の現場を物理削除する。所属部署は統合先・統合元の和集合にする
// （一つの現場を複数部署が共用できるため、統合による部署の食い違いは制約せず引き継ぐ）。
// 台帳の内容を変える操作のため、理由を必須とし監査ログ(site_merge_log)に恒久記録する
export async function mergeSites(formData: FormData) {
  const session = await requireAdmin();
  const executedById = (session?.user as { id?: string } | undefined)?.id;
  if (!executedById) redirect("/admin/sites?error=not_found");

  const targetId = String(formData.get("targetId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const sourceIds = formData
    .getAll("sourceIds")
    .map(String)
    .filter((id) => id && id !== targetId);
  if (!targetId || sourceIds.length === 0) {
    redirect("/admin/sites?error=merge_selection");
  }
  // 提出済みエクスポートとの差異を後から説明できるよう、理由は必須
  if (!reason) {
    redirect("/admin/sites?error=merge_reason");
  }

  const [target, sources] = await Promise.all([
    prisma.site.findUnique({
      where: { id: targetId },
      include: { departmentLinks: { include: { department: true } } },
    }),
    prisma.site.findMany({
      where: { id: { in: sourceIds } },
      include: { departmentLinks: { include: { department: true } } },
    }),
  ]);
  if (!target || sources.length !== sourceIds.length) {
    redirect("/admin/sites?error=not_found");
  }

  const involvedDepartmentIds = new Set<string>();
  const involvedDepartmentNames = new Set<string>();
  for (const link of target.departmentLinks) {
    involvedDepartmentIds.add(link.departmentId);
    involvedDepartmentNames.add(link.department.name);
  }
  for (const source of sources) {
    for (const link of source.departmentLinks) {
      involvedDepartmentIds.add(link.departmentId);
      involvedDepartmentNames.add(link.department.name);
    }
  }

  // Neonコールドスタート対策の再試行付き（トランザクション開始前の失敗のみ再試行される）
  await withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const moved = await tx.tankTransaction.updateMany({
        where: { siteId: { in: sourceIds } },
        data: { siteId: targetId },
      });
      // 所属部署は和集合にする（統合元だけが持っていた部署も統合先が引き継ぐ）
      for (const departmentId of involvedDepartmentIds) {
        await tx.siteDepartment.upsert({
          where: { siteId_departmentId: { siteId: targetId, departmentId } },
          update: {},
          create: { siteId: targetId, departmentId },
        });
      }
      // 統合元のリンクを先に外してから物理削除する（外部キーがRESTRICTのため順序が重要）
      await tx.siteDepartment.deleteMany({ where: { siteId: { in: sourceIds } } });
      await tx.site.deleteMany({ where: { id: { in: sourceIds } } });
      await tx.siteMergeLog.create({
        data: {
          executedById,
          departmentNames: [...involvedDepartmentNames],
          targetSiteId: target.id,
          targetSiteName: target.name,
          sourceSiteNames: sources.map((s) => s.name),
          movedTransactionCount: moved.count,
          reason,
        },
      });
    }),
  );

  revalidatePath("/admin/sites");
  revalidatePath("/admin/export");
  revalidatePath("/record");
  revalidatePath("/history");
}

// 台帳から参照されていない現場のみ物理削除できる。参照が残る現場は統合か無効化で整理する
export async function deleteSite(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  const referenceCount = await prisma.tankTransaction.count({ where: { siteId: id } });
  if (referenceCount > 0) {
    redirect("/admin/sites?error=has_transactions");
  }

  try {
    await prisma.$transaction([
      prisma.siteDepartment.deleteMany({ where: { siteId: id } }),
      prisma.site.delete({ where: { id } }),
    ]);
  } catch (e) {
    // カウント確認と削除の間に記録が入った場合は外部キー制約(P2003)で止まる
    if ((e as { code?: string }).code === "P2003") redirect("/admin/sites?error=has_transactions");
    throw e;
  }
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}
