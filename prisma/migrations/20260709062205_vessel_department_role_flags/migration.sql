-- AlterTable
ALTER TABLE "masters_barge" DROP COLUMN "allowReceiving";
ALTER TABLE "masters_barge" DROP COLUMN "allowSourcing";

-- AlterTable
ALTER TABLE "vessel_department" ADD COLUMN "allowReceiving" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "vessel_department" ADD COLUMN "allowSourcing" BOOLEAN NOT NULL DEFAULT true;
