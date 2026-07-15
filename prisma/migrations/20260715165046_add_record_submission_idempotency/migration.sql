-- CreateTable
CREATE TABLE "record_submissions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_submissions_pkey" PRIMARY KEY ("id")
);
