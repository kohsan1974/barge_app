-- CreateEnum
CREATE TYPE "DepartmentType" AS ENUM ('TRANSPORT', 'PROCESSING');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "VesselStatus" AS ENUM ('ACTIVE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECEIVE', 'PROCESS', 'CALIBRATION', 'CORRECTION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masters_department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DepartmentType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "masters_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_department" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masters_site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "masters_site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masters_ship" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "masters_ship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masters_item_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "masters_item_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_vessel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxCapacity" DECIMAL(10,2) NOT NULL,
    "currentBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "VesselStatus" NOT NULL DEFAULT 'ACTIVE',
    "decommissionedAt" TIMESTAMP(3),

    CONSTRAINT "master_vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tank_transactions" (
    "id" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionType" "TransactionType" NOT NULL,
    "vesselId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "siteId" TEXT,
    "shipId" TEXT,
    "itemTypeId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "measuredValue" DECIMAL(10,2),
    "systemValueBefore" DECIMAL(10,2),
    "referenceTransactionId" TEXT,
    "reason" TEXT,
    "approvedById" TEXT,
    "regulatoryTags" TEXT[],

    CONSTRAINT "tank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_history" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "filterJson" JSONB NOT NULL,
    "format" TEXT NOT NULL,
    "fileHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "operator_department_userId_departmentId_key" ON "operator_department"("userId", "departmentId");

-- CreateIndex
CREATE INDEX "tank_transactions_vesselId_businessDate_idx" ON "tank_transactions"("vesselId", "businessDate");

-- CreateIndex
CREATE INDEX "tank_transactions_slipId_idx" ON "tank_transactions"("slipId");

-- AddForeignKey
ALTER TABLE "operator_department" ADD CONSTRAINT "operator_department_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_department" ADD CONSTRAINT "operator_department_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "masters_site" ADD CONSTRAINT "masters_site_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "master_vessel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "masters_department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "masters_site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_shipId_fkey" FOREIGN KEY ("shipId") REFERENCES "masters_ship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "masters_item_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_referenceTransactionId_fkey" FOREIGN KEY ("referenceTransactionId") REFERENCES "tank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_history" ADD CONSTRAINT "export_history_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
