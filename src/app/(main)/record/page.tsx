import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RecordForm } from "./record-form";

export default async function RecordPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    // JWTの仕様変更等でidが欠けた古いセッションを弾き、再ログインさせる
    redirect("/login");
  }

  const [assignments, vessels, sites, trucks] = await Promise.all([
    prisma.operatorDepartment.findMany({
      where: { userId, isActive: true, department: { isActive: true } },
      include: { department: true },
      orderBy: { department: { name: "asc" } },
    }),
    prisma.vessel.findMany({
      // 廃止済みバージ配下のタンクは記録対象から外す
      where: { status: "ACTIVE", OR: [{ bargeId: null }, { barge: { status: "ACTIVE" } }] },
      orderBy: { name: "asc" },
      include: {
        barge: true,
        allowedContents: {
          where: { itemType: { isActive: true } },
          include: { itemType: true },
          orderBy: { itemType: { name: "asc" } },
        },
      },
    }),
    // 現場ごとに登録されている本船を直接持たせる（本船は現場マスタの中で管理するため）
    prisma.site.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        departmentLinks: { select: { departmentId: true } },
        shipLinks: { where: { ship: { isActive: true } }, include: { ship: true } },
      },
    }),
    prisma.truck.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const departments = assignments.map((a) => a.department);
  // 現場は複数部署に所属できるため、選択中の部署に応じた絞り込みができるよう部署id一覧を添える。
  // 本船は「選択された現場に登録されている本船のみ」を表示するため、現場ごとの登録本船一覧も添える
  const siteOptions = sites.map((s) => ({
    id: s.id,
    name: s.name,
    departmentIds: s.departmentLinks.map((l) => l.departmentId),
    ships: s.shipLinks.map((l) => ({ id: l.ship.id, name: l.ship.name })),
  }));
  // トラックは記録者が選んだ部署に属するものだけを選択肢にする
  const truckOptions = trucks.map((t) => ({ id: t.id, name: t.name, departmentId: t.departmentId }));
  // バージ間でタンク名が重複しうるため（各バージの「1」等）、バージ名を冠して区別する。
  // ただし「登録タンクの総量のみで表示する」設定のバージはタンク番号を出さずバージ名のみ表示する。
  // 各タンクには登録済みの内容物リストと所属部署を添え、選択後に内容物・部署で絞り込む
  const vesselOptions = vessels
    .map((v) => ({
      id: v.id,
      name: v.barge ? (v.barge.showTotalOnly ? v.barge.name : `${v.barge.name}-${v.name}`) : v.name,
      departmentId: v.departmentId,
      contents: v.allowedContents.map((link) => ({
        id: link.itemType.id,
        name: link.itemType.name,
        unit: link.itemType.unit,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <div>
      <h1 className="mb-6 text-base font-medium text-zinc-900 dark:text-zinc-50">
        搬入・処理の記録
      </h1>

      {departments.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          あなたに割り当てられた部署がありません。管理者に部署の割り当てを依頼してください。
        </p>
      ) : (
        <RecordForm
          departments={departments}
          sites={siteOptions}
          trucks={truckOptions}
          vessels={vesselOptions}
        />
      )}
    </div>
  );
}
