-- 現場統合の監査ログ。台帳のsiteId訂正（追記専用制約の唯一の例外）を
-- 「誰が・いつ・何を・なぜ」の形で恒久的に記録し、提出済みCSVとの差異を説明可能にする

-- CreateTable
CREATE TABLE "site_merge_log" (
    "id" TEXT NOT NULL,
    "executedById" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "targetSiteId" TEXT NOT NULL,
    "targetSiteName" TEXT NOT NULL,
    "sourceSiteNames" TEXT[],
    "movedTransactionCount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_merge_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "site_merge_log" ADD CONSTRAINT "site_merge_log_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
