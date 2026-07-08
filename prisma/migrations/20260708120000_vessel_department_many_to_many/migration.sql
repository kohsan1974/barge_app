-- タンクの所属部署を単一(nullable FK)から複数選択可能な多対多(VesselDepartment)へ変更する。
-- 移行時点でdepartmentIdが設定されていたタンクがあれば、そのリンクをVesselDepartmentへ引き継ぐ。

-- CreateTable
CREATE TABLE "vessel_department" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "vessel_department_pkey" PRIMARY KEY ("id")
);

-- 既存のdepartmentIdをVesselDepartmentへ引き継ぐ（このDBでは対象0件だが、他環境での安全のため実施）
INSERT INTO "vessel_department" ("id", "vesselId", "departmentId")
SELECT gen_random_uuid(), "id", "departmentId"
FROM "master_vessel"
WHERE "departmentId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "master_vessel" DROP CONSTRAINT "master_vessel_departmentId_fkey";

-- AlterTable
ALTER TABLE "master_vessel" DROP COLUMN "departmentId";

-- CreateIndex
CREATE UNIQUE INDEX "vessel_department_vesselId_departmentId_key" ON "vessel_department"("vesselId", "departmentId");

-- AddForeignKey
ALTER TABLE "vessel_department" ADD CONSTRAINT "vessel_department_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "master_vessel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vessel_department" ADD CONSTRAINT "vessel_department_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
