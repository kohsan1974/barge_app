-- バージ単位の表示方法(displayMode)を廃止し、タンク単位の「単一表示」フラグに移行する

-- AlterTable
ALTER TABLE "master_vessel" ADD COLUMN     "showIndividually" BOOLEAN NOT NULL DEFAULT true;

-- 「合計のみ表示」だったバージ配下のタンクは単一表示OFFに初期化し、一覧の見た目を維持する
UPDATE "master_vessel" SET "showIndividually" = false
WHERE "bargeId" IN (SELECT "id" FROM "masters_barge" WHERE "displayMode" = 'TOTAL');

-- AlterTable
ALTER TABLE "masters_barge" DROP COLUMN "displayMode";

-- DropEnum
DROP TYPE "BargeDisplayMode";
