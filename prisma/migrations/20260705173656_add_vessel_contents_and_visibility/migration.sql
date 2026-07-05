-- AlterTable
ALTER TABLE "master_vessel" ADD COLUMN     "showInList" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "vessel_item_type" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,

    CONSTRAINT "vessel_item_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vessel_item_type_vesselId_itemTypeId_key" ON "vessel_item_type"("vesselId", "itemTypeId");

-- AddForeignKey
ALTER TABLE "vessel_item_type" ADD CONSTRAINT "vessel_item_type_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "master_vessel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_item_type" ADD CONSTRAINT "vessel_item_type_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "masters_item_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
