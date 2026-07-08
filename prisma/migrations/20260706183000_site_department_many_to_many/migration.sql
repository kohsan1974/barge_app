-- 現場(Site)の所属部署を単一からSiteDepartment経由の多対多に変更する。
-- 従来は「一つの現場を複数部署が使う」場合に同名の現場行が部署ごとに重複していたため、
-- 移行時に同名行を1件へ統合し、各部署とのリンクをSiteDepartmentへ移す。

-- CreateTable
CREATE TABLE "site_department" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "site_department_pkey" PRIMARY KEY ("id")
);

-- 統合先(canonical)を名前ごとに決定する（同名行のうち最小idを代表として残す）
CREATE TEMP TABLE _site_canon AS
SELECT name, MIN(id) AS canonical_id, bool_or("isActive") AS any_active
FROM "masters_site"
GROUP BY name;

-- 各(統合後の現場, 部署)の組み合わせをSiteDepartmentへ移す（重複部署は1件に集約）
INSERT INTO "site_department" ("id", "siteId", "departmentId")
SELECT gen_random_uuid(), c.canonical_id, pairs."departmentId"
FROM (
  SELECT DISTINCT c.canonical_id, s."departmentId"
  FROM "masters_site" s
  JOIN _site_canon c ON c.name = s.name
) pairs
JOIN _site_canon c ON c.canonical_id = pairs.canonical_id;

-- 台帳の現場参照を統合先idへ付け替える（法的証跡の現場名は変わらない。物理的に同じ現場を指すレコードの整理のため）
UPDATE "tank_transactions" t
SET "siteId" = c.canonical_id
FROM "masters_site" s
JOIN _site_canon c ON c.name = s.name
WHERE t."siteId" = s.id AND s.id <> c.canonical_id;

-- 統合先の有効フラグは、統合された行のいずれかが有効なら有効にする
UPDATE "masters_site" s
SET "isActive" = c.any_active
FROM _site_canon c
WHERE s.id = c.canonical_id;

-- 統合元(非canonical)の重複行を削除
DELETE FROM "masters_site" s
USING _site_canon c
WHERE c.name = s.name AND s.id <> c.canonical_id;

DROP TABLE _site_canon;

-- DropForeignKey
ALTER TABLE "masters_site" DROP CONSTRAINT "masters_site_departmentId_fkey";

-- DropIndex（旧: 部署内でのみ一意だった制約）
DROP INDEX "masters_site_departmentId_name_key";

-- AlterTable
ALTER TABLE "masters_site" DROP COLUMN "departmentId";

-- CreateIndex（現場名は全体で一意。統合によりこの時点で重複はない）
CREATE UNIQUE INDEX "masters_site_name_key" ON "masters_site"("name");

-- CreateIndex
CREATE UNIQUE INDEX "site_department_siteId_departmentId_key" ON "site_department"("siteId", "departmentId");

-- AddForeignKey
ALTER TABLE "site_department" ADD CONSTRAINT "site_department_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "masters_site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "site_department" ADD CONSTRAINT "site_department_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
