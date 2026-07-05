-- DropForeignKey
ALTER TABLE "tank_transactions" DROP CONSTRAINT "tank_transactions_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "tank_transactions" DROP CONSTRAINT "tank_transactions_itemTypeId_fkey";

-- AlterTable
ALTER TABLE "tank_transactions" ALTER COLUMN "departmentId" DROP NOT NULL,
ALTER COLUMN "itemTypeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "masters_item_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
