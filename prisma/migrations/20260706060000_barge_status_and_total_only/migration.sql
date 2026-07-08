-- バージに「総量のみ表示」フラグと稼働状態を追加し、役割が置き換わったタンクのshowInListを廃止する

-- AlterTable
ALTER TABLE "masters_barge" ADD COLUMN     "showTotalOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "masters_barge" ADD COLUMN     "status" "VesselStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "masters_barge" ADD COLUMN     "decommissionedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "master_vessel" DROP COLUMN "showInList";
