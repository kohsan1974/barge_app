-- 本船を現場マスタの中で管理する多対多(SiteShip)に変更し、
-- トラックマスタ(部署必須)、タンクの所属部署(任意)、台帳のtruckId参照を追加する。

-- CreateTable
CREATE TABLE "site_ship" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "shipId" TEXT NOT NULL,

    CONSTRAINT "site_ship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masters_truck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "masters_truck_pkey" PRIMARY KEY ("id")
);

-- AlterTable: タンクの所属部署（任意）
ALTER TABLE "master_vessel" ADD COLUMN "departmentId" TEXT;

-- AlterTable: 台帳のトラック参照
ALTER TABLE "tank_transactions" ADD COLUMN "truckId" TEXT;

-- 既存台帳の(現場, 本船)組み合わせの実績をSiteShipへ引き継ぐ
-- （これまで現場と本船は独立マスタで、記録実績からのみ関連が分かる状態だったため）
INSERT INTO "site_ship" ("id", "siteId", "shipId")
SELECT gen_random_uuid(), "siteId", "shipId"
FROM (
  SELECT DISTINCT "siteId", "shipId"
  FROM "tank_transactions"
  WHERE "siteId" IS NOT NULL AND "shipId" IS NOT NULL
) pairs;

-- CreateIndex
CREATE UNIQUE INDEX "site_ship_siteId_shipId_key" ON "site_ship"("siteId", "shipId");
CREATE UNIQUE INDEX "masters_truck_name_key" ON "masters_truck"("name");

-- AddForeignKey
ALTER TABLE "site_ship" ADD CONSTRAINT "site_ship_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "masters_site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "site_ship" ADD CONSTRAINT "site_ship_shipId_fkey" FOREIGN KEY ("shipId") REFERENCES "masters_ship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "masters_truck" ADD CONSTRAINT "masters_truck_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "master_vessel" ADD CONSTRAINT "master_vessel_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "masters_truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
