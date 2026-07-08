-- 台帳の不変制約の緩和:
-- 数量・残高・取引の実体(数値/タンク/種別/日時/記録者など)は従来通りUPDATE/DELETE禁止のまま、
-- 現場参照(siteId)のみ、自由入力による重複現場をマスタ統合するためにUPDATEを許可する。
-- DELETEは引き続き全面禁止。

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- siteId 以外のすべての列が不変であることを確認できた場合のみ許可する
    IF NEW."id"                     IS NOT DISTINCT FROM OLD."id"
       AND NEW."slipId"             IS NOT DISTINCT FROM OLD."slipId"
       AND NEW."businessDate"       IS NOT DISTINCT FROM OLD."businessDate"
       AND NEW."createdAt"          IS NOT DISTINCT FROM OLD."createdAt"
       AND NEW."transactionType"    IS NOT DISTINCT FROM OLD."transactionType"
       AND NEW."vesselId"           IS NOT DISTINCT FROM OLD."vesselId"
       AND NEW."recordedById"       IS NOT DISTINCT FROM OLD."recordedById"
       AND NEW."departmentId"       IS NOT DISTINCT FROM OLD."departmentId"
       AND NEW."shipId"             IS NOT DISTINCT FROM OLD."shipId"
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
    RAISE EXCEPTION 'tank_transactions is append-only: only siteId may be corrected (for site dedupe). Row id %.', OLD.id;
  END IF;
  RAISE EXCEPTION 'tank_transactions is append-only: % is not allowed. Insert a CORRECTION row referencing id % instead.', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;
