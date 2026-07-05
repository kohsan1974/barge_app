-- 台帳(tank_transactions)は追記専用(INSERT のみ)とし、
-- UPDATE / DELETE をアプリのバグや誤操作からもDBレベルで物理的に禁止する。
-- 訂正が必要な場合は、referenceTransactionId で元の行を参照する新しい行を INSERT すること。

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tank_transactions is append-only: % is not allowed. Insert a CORRECTION row referencing id % instead.', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tank_transactions_no_update
BEFORE UPDATE ON tank_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER trg_tank_transactions_no_delete
BEFORE DELETE ON tank_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
