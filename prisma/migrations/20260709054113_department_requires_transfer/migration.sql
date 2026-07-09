-- DropForeignKey
ALTER TABLE "tank_transactions" DROP CONSTRAINT "tank_transactions_truckId_fkey";

-- AlterTable
ALTER TABLE "masters_department" ADD COLUMN     "requiresTransfer" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "masters_truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
