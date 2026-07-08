-- マスタ名称のユニーク制約。
-- 目的1: 現場の自由入力（findFirst→create）の同時送信レースによる重複登録の根絶
-- 目的2: 公的書類上の「バージ名／タンク名」「本船名」の識別性の保証
-- ※ master_vessel は bargeId が NULL（所属なし）同士の同名はPostgresの仕様上許容される

-- CreateIndex
CREATE UNIQUE INDEX "masters_site_departmentId_name_key" ON "masters_site"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "masters_barge_name_key" ON "masters_barge"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_vessel_bargeId_name_key" ON "master_vessel"("bargeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "masters_ship_name_key" ON "masters_ship"("name");

-- CreateIndex
CREATE UNIQUE INDEX "masters_item_type_name_key" ON "masters_item_type"("name");
