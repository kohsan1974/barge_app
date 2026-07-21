import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vesselLabel } from "@/lib/labels";
import { RecordForm } from "./record-form";

export default async function RecordPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    // JWTの仕様変更等でidが欠けた古いセッションを弾き、再ログインさせる
    redirect("/login");
  }

  const [assignments, vessels, sites, trucks, itemTypes] = await Promise.all([
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
        departmentLinks: { select: { departmentId: true, allowReceiving: true, allowSourcing: true } },
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
        departmentLinks: { select: { departmentId: true, department: { select: { type: true } } } },
        shipLinks: { where: { ship: { isActive: true } }, include: { ship: true } },
      },
    }),
    prisma.truck.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    // シフトは処理中に容態が変化するため、タンク登録に縛られず全内容物から選べるようにする用途
    prisma.itemType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
  ]);

  const departments = assignments.map((a) => a.department);
  const allContents = itemTypes.map((it) => ({ id: it.id, name: it.name, unit: it.unit }));
  // 現場は複数部署に所属できるため、選択中の部署に応じた絞り込みができるよう部署id一覧を添える。
  // 本船は「選択された現場に登録されている本船のみ」を表示するため、現場ごとの登録本船一覧も添える。
  // types は紐づく部署の種別（運搬/処理）一覧。記録画面では選択中の部署と同じ種別の現場だけに絞り込む
  const siteOptions = sites.map((s) => ({
    id: s.id,
    name: s.name,
    departmentIds: s.departmentLinks.map((l) => l.departmentId),
    types: [...new Set(s.departmentLinks.map((l) => l.department.type))],
    ships: s.shipLinks.map((l) => ({ id: l.ship.id, name: l.ship.name })),
  }));
  // トラックは記録者が選んだ部署に属するものだけを選択肢にする
  const truckOptions = trucks.map((t) => ({ id: t.id, name: t.name, departmentId: t.departmentId }));

  // バージ間でタンク名が重複しうるため（各バージの「1」等）、バージ名を冠して区別する。
  // ただし「登録タンクの総量のみで表示する」設定のバージは、記録画面でもタンク単位ではなく
  // バージ単位の1エントリにまとめる（バージ名のみ表示、内容物は配下タンクの和集合、実際の
  // 数量分配はサーバー側で行う。id は "group:<bargeId>" とし record-transaction.ts 側で解決する）
  type VesselNode = (typeof vessels)[number];
  const groupedByBarge = new Map<string, VesselNode[]>();
  const standalone: VesselNode[] = [];
  for (const v of vessels) {
    if (v.barge?.showTotalOnly) {
      const list = groupedByBarge.get(v.barge.id) ?? [];
      list.push(v);
      groupedByBarge.set(v.barge.id, list);
    } else {
      standalone.push(v);
    }
  }

  const contentsOf = (v: VesselNode) =>
    v.allowedContents.map((link) => ({
      id: link.itemType.id,
      name: link.itemType.name,
      unit: link.itemType.unit,
    }));

  // 記録画面での役割（受入れ・搬入元）はバージ単位ではなく「タンク×部署」の組ごとに持つ。
  // departmentRolesが空＝どの部署にも属していないタンクで、記録画面のどの部署からも選択できない
  // （所属部署を割り当てるまでは記録に使えない、という運用）
  type DeptRole = { departmentId: string; allowReceiving: boolean; allowSourcing: boolean };
  const rolesOf = (v: VesselNode): DeptRole[] =>
    v.departmentLinks.map((l) => ({
      departmentId: l.departmentId,
      allowReceiving: l.allowReceiving,
      allowSourcing: l.allowSourcing,
    }));

  const vesselOptions = [
    ...standalone.map((v) => ({
      id: v.id,
      name: vesselLabel(v),
      departmentRoles: rolesOf(v),
      contents: contentsOf(v),
    })),
    ...[...groupedByBarge.entries()].map(([bargeId, members]) => {
      // 部署ごとに、配下タンクのいずれかがその役割で利用可能なら、グループ全体としても利用可能とする
      // （所属部署のないタンクはどの部署にも寄与しない。実際の分配・可否判定はサーバー側resolveTarget
      // がタンク単位で改めて絞り込む）
      const roleMap = new Map<string, { allowReceiving: boolean; allowSourcing: boolean }>();
      for (const m of members) {
        for (const link of m.departmentLinks) {
          const existing = roleMap.get(link.departmentId) ?? { allowReceiving: false, allowSourcing: false };
          roleMap.set(link.departmentId, {
            allowReceiving: existing.allowReceiving || link.allowReceiving,
            allowSourcing: existing.allowSourcing || link.allowSourcing,
          });
        }
      }
      const departmentRoles: DeptRole[] = [...roleMap.entries()].map(([departmentId, role]) => ({
        departmentId,
        ...role,
      }));
      const contentsById = new Map<string, { id: string; name: string; unit: string }>();
      for (const m of members) for (const c of contentsOf(m)) contentsById.set(c.id, c);
      return {
        id: `group:${bargeId}`,
        name: members[0].barge!.name,
        departmentRoles,
        contents: [...contentsById.values()],
      };
    }),
  ].sort((a, b) => a.name.localeCompare(b.name, "ja"));

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
          allContents={allContents}
        />
      )}
    </div>
  );
}
