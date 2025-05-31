-- DropForeignKey
ALTER TABLE "return_items" DROP CONSTRAINT "return_items_original_order_item_id_fkey";

-- AlterTable
ALTER TABLE "return_items" ALTER COLUMN "original_order_item_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_original_order_item_id_fkey" FOREIGN KEY ("original_order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
