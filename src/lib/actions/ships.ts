"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";
import { isUniqueViolation, uniqueViolationTarget, withDbRetry } from "@/lib/db-utils";

// IMO番号は7桁の数字（任意入力。持たない小型船・バージは空欄でよい）
const IMO_RE = /^\d{7}$/;

// 一意制約違反（名前 or IMO番号）をエラーコードに変換する
function duplicateErrorCode(e: unknown): string {
  return uniqueViolationTarget(e).includes("imoNumber") ? "duplicate_imo" : "duplicate_ship";
}

// 本船と現場の紐付けを選択状態どおりに張り替える（1隻が複数現場に所属できる）。
// 呼び出し側のトランザクション（tx）内で使えるよう、クライアントを引数で受け取る
async function syncShipSites(db: Prisma.TransactionClient, shipId: string, siteIds: string[]) {
  await db.siteShip.deleteMany({
    where: { shipId, siteId: { notIn: siteIds } },
  });
  for (const siteId of siteIds) {
    await db.siteShip.upsert({
      where: { siteId_shipId: { siteId, shipId } },
      update: {},
      create: { siteId, shipId },
    });
  }
}

export async function createShip(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const imoRaw = String(formData.get("imoNumber") ?? "").trim();
  const siteIds = formData.getAll("siteIds").map(String).filter(Boolean);
  if (!name) redirect("/admin/ships?error=invalid_ship");
  if (imoRaw && !IMO_RE.test(imoRaw)) redirect("/admin/ships?error=invalid_imo");

  try {
    // 本船の作成と現場リンクをひとつのトランザクションにまとめる
    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const ship = await tx.ship.create({
          data: { name, imoNumber: imoRaw || null },
        });
        await syncShipSites(tx, ship.id, siteIds);
      }),
    );
  } catch (e) {
    if (isUniqueViolation(e)) redirect(`/admin/ships?error=${duplicateErrorCode(e)}`);
    throw e;
  }
  revalidatePath("/admin/ships");
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 都度保存（オートセーブ）用: 本船1件の名前 or IMO番号だけを更新する。結果を返す。
// IMO番号は空欄可（持たない小型船）。名前・IMOの重複は一意制約でエラーにする
export async function updateShipField(
  id: string,
  field: "name" | "imoNumber",
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!id) return { ok: false, error: "対象の本船が見つかりません" };

  try {
    if (field === "name") {
      const name = value.trim();
      if (!name) return { ok: false, error: "本船名を入力してください" };
      await prisma.ship.update({ where: { id }, data: { name } });
    } else {
      const imo = value.trim();
      if (imo && !IMO_RE.test(imo)) {
        return { ok: false, error: "IMO番号は7桁の数字で入力してください（持たない船は空欄）" };
      }
      await prisma.ship.update({ where: { id }, data: { imoNumber: imo || null } });
    }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return {
        ok: false,
        error:
          duplicateErrorCode(e) === "duplicate_imo"
            ? "同じIMO番号の本船がすでに登録されています"
            : "同じ名前の本船がすでに登録されています",
      };
    }
    throw e;
  }
  revalidatePath("/admin/ships");
  revalidatePath("/admin/sites");
  revalidatePath("/record");
  return { ok: true };
}

// 本船一覧の一括保存（名前・IMO番号）。画面右下の共通「変更を保存」ボタンから全行分をまとめて送信する。
// 先に全行を検証してから1つのトランザクションで書き込む（全or無）。
// 現場の割り当てはチップUI（addShipSite/removeShipSite）で即時保存するため、ここでは扱わない
export async function saveShips(formData: FormData) {
  await requireAdmin();
  const shipIds = formData.getAll("shipIds").map(String).filter(Boolean);

  const updates = shipIds.map((id) => ({
    id,
    name: String(formData.get(`shipName_${id}`) ?? "").trim(),
    imoNumber: String(formData.get(`shipImo_${id}`) ?? "").trim(),
  }));
  for (const u of updates) {
    if (!u.name) redirect("/admin/ships?error=invalid_ship");
    if (u.imoNumber && !IMO_RE.test(u.imoNumber)) redirect("/admin/ships?error=invalid_imo");
  }

  try {
    await withDbRetry(() =>
      prisma.$transaction(
        updates.map((u) =>
          prisma.ship.update({
            where: { id: u.id },
            data: { name: u.name, imoNumber: u.imoNumber || null },
          }),
        ),
      ),
    );
  } catch (e) {
    if (isUniqueViolation(e)) redirect(`/admin/ships?error=${duplicateErrorCode(e)}`);
    throw e;
  }
  revalidatePath("/admin/ships");
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 本船に現場を1件追加する（チップUIのプルダウンから選んで追加。即時保存）
export async function addShipSite(formData: FormData) {
  await requireAdmin();
  const shipId = String(formData.get("shipId") ?? "");
  const siteId = String(formData.get("siteId") ?? "");
  if (!shipId || !siteId) return;

  await prisma.siteShip.upsert({
    where: { siteId_shipId: { siteId, shipId } },
    update: {},
    create: { siteId, shipId },
  });
  revalidatePath("/admin/ships");
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 本船から現場の割り当てを1件解除する（過去の台帳記録には影響しない運用上のルーティング設定）
export async function removeShipSite(formData: FormData) {
  await requireAdmin();
  const shipId = String(formData.get("shipId") ?? "");
  const siteId = String(formData.get("siteId") ?? "");
  if (!shipId || !siteId) return;

  await prisma.siteShip.deleteMany({ where: { shipId, siteId } });
  revalidatePath("/admin/ships");
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

export async function toggleShipActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";
  if (!id) return;

  await prisma.ship.update({ where: { id }, data: { isActive: nextActive } });
  revalidatePath("/admin/ships");
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}

// 台帳から参照されていない本船のみ物理削除できる（参照がある場合は無効化を使う）
export async function deleteShip(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;

  const referenceCount = await prisma.tankTransaction.count({ where: { shipId: id } });
  if (referenceCount > 0) {
    redirect("/admin/ships?error=has_transactions");
  }

  try {
    await prisma.$transaction([
      prisma.siteShip.deleteMany({ where: { shipId: id } }),
      prisma.ship.delete({ where: { id } }),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === "P2003") redirect("/admin/ships?error=has_transactions");
    throw e;
  }
  revalidatePath("/admin/ships");
  revalidatePath("/admin/sites");
  revalidatePath("/record");
}
