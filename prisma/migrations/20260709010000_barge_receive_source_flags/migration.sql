-- バージに「受入れタンク」「搬入タンク（振替元）」として記録画面に出すかの役割フラグを追加する。
-- 既存バージは両方trueで初期化し、これまで通り両方の選択肢に表示されるようにする（後方互換）。

ALTER TABLE "masters_barge" ADD COLUMN "allowReceiving" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "masters_barge" ADD COLUMN "allowSourcing" BOOLEAN NOT NULL DEFAULT true;
