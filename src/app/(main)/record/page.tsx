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

  const [assignments, ships, vessels, sites] = await Promise.all([
    prisma.operatorDepartment.findMany({
      where: { userId, isActive: true, department: { isActive: true } },
      include: { department: true },
      orderBy: { department: { name: "asc" } },
    }),
    prisma.ship.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.vessel.findMany({
      where: { status: "ACTIVE" },
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
    prisma.site.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const departments = assignments.map((a) => a.department);
  // バージ間でタンク名が重複しうるため（各バージの「1」等）、バージ名を冠して区別する。
  // 各タンクには登録済みの内容物リストを添え、タンク選択後にそこから選ばせる
  const vesselOptions = vessels
    .map((v) => ({
      id: v.id,
      name: v.barge ? `${v.barge.name}／${v.name}` : v.name,
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
          sites={sites}
          ships={ships}
          vessels={vesselOptions}
        />
      )}
    </div>
  );
}
