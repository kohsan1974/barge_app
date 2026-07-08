-- 現場が複数部署に所属できるようになったため、統合ログの部署名を単一からスナップショット配列に変更する。
-- テーブルはまだ空のため、既存データの変換は不要

ALTER TABLE "site_merge_log" DROP COLUMN "departmentName";
ALTER TABLE "site_merge_log" ADD COLUMN "departmentNames" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "site_merge_log" ALTER COLUMN "departmentNames" DROP DEFAULT;
