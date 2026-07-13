-- 本船マスタにIMO番号（7桁・任意・一意）を追加。列追加のみの後方互換な変更のため、
-- 稼働中の旧コードに影響なく即時適用できる
ALTER TABLE "masters_ship" ADD COLUMN "imoNumber" TEXT;
CREATE UNIQUE INDEX "masters_ship_imoNumber_key" ON "masters_ship"("imoNumber");
