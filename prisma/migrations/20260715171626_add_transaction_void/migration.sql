-- AlterTable
ALTER TABLE "tank_transactions" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AddForeignKey
ALTER TABLE "tank_transactions" ADD CONSTRAINT "tank_transactions_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 追記専用トリガーの改修（v3）:
-- 従来の「siteIdのみ訂正可」に加えて、「取消3列(voidedAt/voidedById/voidReason)のみのUPDATE」を
-- 例外的に許可する（adminによる論理削除のため）。それ以外の列の変更・DELETEは引き続き全面禁止。
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- (1) siteId のみの訂正（現場マスタ統合用）
    IF NEW."id"                     IS NOT DISTINCT FROM OLD."id"
       AND NEW."slipId"             IS NOT DISTINCT FROM OLD."slipId"
       AND NEW."businessDate"       IS NOT DISTINCT FROM OLD."businessDate"
       AND NEW."createdAt"          IS NOT DISTINCT FROM OLD."createdAt"
       AND NEW."transactionType"    IS NOT DISTINCT FROM OLD."transactionType"
       AND NEW."vesselId"           IS NOT DISTINCT FROM OLD."vesselId"
       AND NEW."recordedById"       IS NOT DISTINCT FROM OLD."recordedById"
       AND NEW."departmentId"       IS NOT DISTINCT FROM OLD."departmentId"
       AND NEW."shipId"             IS NOT DISTINCT FROM OLD."shipId"
       AND NEW."truckId"            IS NOT DISTINCT FROM OLD."truckId"
       AND NEW."itemTypeId"         IS NOT DISTINCT FROM OLD."itemTypeId"
       AND NEW."quantity"           IS NOT DISTINCT FROM OLD."quantity"
       AND NEW."balanceAfter"       IS NOT DISTINCT FROM OLD."balanceAfter"
       AND NEW."measuredValue"      IS NOT DISTINCT FROM OLD."measuredValue"
       AND NEW."systemValueBefore"  IS NOT DISTINCT FROM OLD."systemValueBefore"
       AND NEW."referenceTransactionId" IS NOT DISTINCT FROM OLD."referenceTransactionId"
       AND NEW."reason"             IS NOT DISTINCT FROM OLD."reason"
       AND NEW."approvedById"       IS NOT DISTINCT FROM OLD."approvedById"
       AND NEW."regulatoryTags"     IS NOT DISTINCT FROM OLD."regulatoryTags"
       AND NEW."voidedAt"           IS NOT DISTINCT FROM OLD."voidedAt"
       AND NEW."voidedById"         IS NOT DISTINCT FROM OLD."voidedById"
       AND NEW."voidReason"         IS NOT DISTINCT FROM OLD."voidReason"
    THEN
      RETURN NEW;
    END IF;
    -- (2) 取消3列のみの変更（adminによる論理削除）
    IF NEW."id"                     IS NOT DISTINCT FROM OLD."id"
       AND NEW."slipId"             IS NOT DISTINCT FROM OLD."slipId"
       AND NEW."businessDate"       IS NOT DISTINCT FROM OLD."businessDate"
       AND NEW."createdAt"          IS NOT DISTINCT FROM OLD."createdAt"
       AND NEW."transactionType"    IS NOT DISTINCT FROM OLD."transactionType"
       AND NEW."vesselId"           IS NOT DISTINCT FROM OLD."vesselId"
       AND NEW."recordedById"       IS NOT DISTINCT FROM OLD."recordedById"
       AND NEW."departmentId"       IS NOT DISTINCT FROM OLD."departmentId"
       AND NEW."siteId"             IS NOT DISTINCT FROM OLD."siteId"
       AND NEW."shipId"             IS NOT DISTINCT FROM OLD."shipId"
       AND NEW."truckId"            IS NOT DISTINCT FROM OLD."truckId"
       AND NEW."itemTypeId"         IS NOT DISTINCT FROM OLD."itemTypeId"
       AND NEW."quantity"           IS NOT DISTINCT FROM OLD."quantity"
       AND NEW."balanceAfter"       IS NOT DISTINCT FROM OLD."balanceAfter"
       AND NEW."measuredValue"      IS NOT DISTINCT FROM OLD."measuredValue"
       AND NEW."systemValueBefore"  IS NOT DISTINCT FROM OLD."systemValueBefore"
       AND NEW."referenceTransactionId" IS NOT DISTINCT FROM OLD."referenceTransactionId"
       AND NEW."reason"             IS NOT DISTINCT FROM OLD."reason"
       AND NEW."approvedById"       IS NOT DISTINCT FROM OLD."approvedById"
       AND NEW."regulatoryTags"     IS NOT DISTINCT FROM OLD."regulatoryTags"
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'tank_transactions is append-only: only siteId or void columns may change. Row id %.', OLD.id;
  END IF;
  RAISE EXCEPTION 'tank_transactions is append-only: % is not allowed. Insert a CORRECTION row referencing id % instead.', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;
