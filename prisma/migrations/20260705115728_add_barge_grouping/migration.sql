-- CreateEnum
CREATE TYPE "BargeDisplayMode" AS ENUM ('INDIVIDUAL', 'TOTAL');

-- AlterTable
ALTER TABLE "master_vessel" ADD COLUMN     "bargeId" TEXT;

-- CreateTable
CREATE TABLE "masters_barge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayMode" "BargeDisplayMode" NOT NULL DEFAULT 'INDIVIDUAL',

    CONSTRAINT "masters_barge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "master_vessel" ADD CONSTRAINT "master_vessel_bargeId_fkey" FOREIGN KEY ("bargeId") REFERENCES "masters_barge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
