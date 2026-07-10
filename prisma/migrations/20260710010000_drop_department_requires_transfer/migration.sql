-- 記録画面が「作業内容」（搬入/シフト/放流/出荷）ベースになり、選択肢は部署種別と
-- タンク役割（vessel_department.allowReceiving/allowSourcing）から導出されるため、
-- 部署単位で振替を強制するフラグは不要になった
ALTER TABLE "masters_department" DROP COLUMN "requiresTransfer";
