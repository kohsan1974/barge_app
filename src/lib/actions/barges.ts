"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { isUniqueViolation, uniqueViolationTarget, withDbRetry } from "@/lib/db-utils";
import { toCenti } from "@/lib/quantity";

// トランザクション内の業務エラーをリダイレクト先エラーコードへ運ぶための例外
class SaveError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function createBarge(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  try {
    await prisma.barge.create({ data: { name } });
  } catch (e) {
    if (isUniqueViolation(e)) redirect("/admin/vessels?error=duplicate_barge");
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/barges");
}

// 都度保存（オートセーブ）用: バージ1件の1項目だけを更新する。
// クライアント側のコントロール変更時に直接呼ばれ、結果を返す（redirectしない＝画面遷移させない）
export type SaveResult = { ok: true } | { ok: false; error: string };

export async function updateBargeField(
  id: string,
  field: "name" | "showTotalOnly",
  value: string | boolean,
): Promise<SaveResult> {
  await requireAdmin();
  if (!id) return { ok: false, error: "対象のバージが見つかりません" };

  try {
    if (field === "name") {
      const name = String(value).trim();
      if (!name) return { ok: false, error: "バージ名を入力してください" };
      await prisma.barge.update({ where: { id }, data: { name } });
    } else {
      await prisma.barge.update({ where: { id }, data: { showTotalOnly: Boolean(value) } });
    }
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "同じ名前のバージがすでに登録されています" };
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/barges");
  revalidatePath("/record");
  return { ok: true };
}

// バージ・タンクマスタ全体の一括保存。ページ内の全バージ（複数）＋全タンクの
// 名前・最大容量・表示設定・所属部署・役割をひとつのトランザクションでまとめて更新する
// （画面右下の共通「変更を保存」ボタンから、開いていないバージ分も含めて送信される）
export async function saveBargeSettings(formData: FormData) {
  await requireAdmin();

  const bargeIds = formData.getAll("bargeIds").map(String).filter(Boolean);
  const bargeUpdates: { id: string; name: string; showTotalOnly: boolean }[] = [];
  for (const id of bargeIds) {
    const name = String(formData.get(`bargeName_${id}`) ?? "").trim();
    const showTotalOnly = formData.get(`showTotalOnly_${id}`) === "on";
    if (!name) redirect("/admin/vessels?error=invalid_tank");
    bargeUpdates.push({ id, name, showTotalOnly });
  }

  const vesselIds = formData.getAll("vesselId").map(String).filter(Boolean);
  const tankUpdates: {
    id: string;
    name: string;
    maxCapacity: number;
    showIndividually: boolean;
    departmentIds: string[];
  }[] = [];
  for (const id of vesselIds) {
    const name = String(formData.get(`vesselName_${id}`) ?? "").trim();
    const maxCapacity = Number(formData.get(`vesselMaxCapacity_${id}`));
    const showIndividually = formData.get(`vesselShowIndividually_${id}`) === "on";
    const departmentIds = formData.getAll(`vesselDepartmentIds_${id}`).map(String).filter(Boolean);
    if (!name || !Number.isFinite(maxCapacity) || maxCapacity <= 0) {
      redirect("/admin/vessels?error=invalid_tank");
    }
    tankUpdates.push({ id, name, maxCapacity, showIndividually, departmentIds });
  }

  try {
    // Neonコールドスタート対策の再試行付き。残量チェックは記録処理と同じ行ロック(FOR UPDATE)の
    // 中で行い、「チェック直後に搬入が走って残量>容量になる」競合窓を塞ぐ。
    // 画面右下の共通ボタンで全バージ・全タンクをまとめて送信するため、既定の5秒では
    // タイムアウトしやすい（タンク数×部署数ぶんの往復が発生する）。timeoutを引き上げて対応する
    await withDbRetry(() =>
      prisma.$transaction(
        async (tx) => {
          if (tankUpdates.length > 0) {
            const ids = tankUpdates.map((t) => t.id);
            const locked = await tx.$queryRaw<
              { id: string; currentBalance: string }[]
            >`SELECT "id", "currentBalance" FROM "master_vessel" WHERE "id" = ANY(${ids}) FOR UPDATE`;
            const balances = new Map(locked.map((v) => [v.id, toCenti(v.currentBalance)]));
            for (const t of tankUpdates) {
              const balanceCenti = balances.get(t.id);
              if (balanceCenti === undefined) throw new SaveError("not_found");
              if (toCenti(t.maxCapacity) < balanceCenti) {
                throw new SaveError("capacity_below_balance");
              }
            }
          }

          for (const b of bargeUpdates) {
            await tx.barge.update({
              where: { id: b.id },
              data: { name: b.name, showTotalOnly: b.showTotalOnly },
            });
          }
          for (const t of tankUpdates) {
            await tx.vessel.update({
              where: { id: t.id },
              data: {
                name: t.name,
                maxCapacity: t.maxCapacity,
                showIndividually: t.showIndividually,
              },
            });
          }
          // 所属部署はチェックボックスの選択状態どおりに張り替える（現場の部署割り当てと同じ方式）。
          // 受入れ・搬入元の役割はバージ単位ではなく、このタンク×部署の組ごとに個別設定する。
          // 全タンク分をまとめて1回のdeleteManyで処理し、往復回数を減らす
          if (tankUpdates.length > 0) {
            await tx.vesselDepartment.deleteMany({
              where: {
                OR: tankUpdates.map((t) => ({ vesselId: t.id, departmentId: { notIn: t.departmentIds } })),
              },
            });
          }
          for (const t of tankUpdates) {
            for (const departmentId of t.departmentIds) {
              const allowReceiving = formData.get(`vesselDeptReceiving_${t.id}_${departmentId}`) === "on";
              const allowSourcing = formData.get(`vesselDeptSourcing_${t.id}_${departmentId}`) === "on";
              await tx.vesselDepartment.upsert({
                where: { vesselId_departmentId: { vesselId: t.id, departmentId } },
                update: { allowReceiving, allowSourcing },
                create: { vesselId: t.id, departmentId, allowReceiving, allowSourcing },
              });
            }
          }
        },
        { timeout: 30000 },
      ),
    );
  } catch (e) {
    if (e instanceof SaveError) redirect(`/admin/vessels?error=${e.code}`);
    if (isUniqueViolation(e)) {
      // タンクの一意制約は(bargeId, name)の複合、バージはnameのみ。対象で出し分ける
      const target = uniqueViolationTarget(e);
      redirect(
        `/admin/vessels?error=${target.includes("bargeId") ? "duplicate_tank" : "duplicate_barge"}`,
      );
    }
    throw e;
  }

  revalidatePath("/admin/vessels");
  revalidatePath("/barges");
  revalidatePath("/record");
}

export async function setBargeStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextStatus = String(formData.get("nextStatus"));
  if (!id || (nextStatus !== "ACTIVE" && nextStatus !== "DECOMMISSIONED")) return;

  // バージの廃止は配下タンクごと残量一覧・記録対象から外す（タンク自体の状態は変えない）
  await prisma.barge.update({
    where: { id },
    data: {
      status: nextStatus,
      decommissionedAt: nextStatus === "DECOMMISSIONED" ? new Date() : null,
    },
  });
  revalidatePath("/admin/vessels");
  revalidatePath("/barges");
  revalidatePath("/record");
}

export async function deleteBarge(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  // 所属タンクが残っているバージを消すと表示上の行き場がなくなるため拒否する
  const vesselCount = await prisma.vessel.count({ where: { bargeId: id } });
  if (vesselCount > 0) {
    redirect("/admin/vessels?error=has_vessels");
  }

  try {
    await prisma.barge.delete({ where: { id } });
  } catch (e) {
    // カウント確認と削除の間にタンクが追加された場合は外部キー制約(P2003)で止まる
    if ((e as { code?: string }).code === "P2003") redirect("/admin/vessels?error=has_vessels");
    throw e;
  }
  revalidatePath("/admin/vessels");
  revalidatePath("/barges");
}
