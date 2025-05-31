/*
  Warnings:

  - The values [CYCLE_COUNT] on the enum `InventoryTransactionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `customerId` on the `returns` table. All the data in the column will be lost.
  - You are about to drop the column `locationId` on the `returns` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tenant_id,name,parent_category_id]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[return_number]` on the table `returns` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `location_id` to the `returns` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InventoryTransactionType_new" AS ENUM ('PURCHASE_RECEIPT', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CYCLE_COUNT_ADJUSTMENT', 'RETURN_RESTOCK', 'RETURN_DISPOSE', 'KIT_ASSEMBLY_CONSUME', 'KIT_ASSEMBLY_PRODUCE');
ALTER TABLE "inventory_transactions" ALTER COLUMN "transaction_type" TYPE "InventoryTransactionType_new" USING ("transaction_type"::text::"InventoryTransactionType_new");
ALTER TYPE "InventoryTransactionType" RENAME TO "InventoryTransactionType_old";
ALTER TYPE "InventoryTransactionType_new" RENAME TO "InventoryTransactionType";
DROP TYPE "InventoryTransactionType_old";
COMMIT;

-- AlterEnum
ALTER TYPE "TransferStatus" ADD VALUE 'PARTIAL';

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "return_items" DROP CONSTRAINT "return_items_restock_location_id_fkey";

-- DropForeignKey
ALTER TABLE "returns" DROP CONSTRAINT "returns_customerId_fkey";

-- DropForeignKey
ALTER TABLE "returns" DROP CONSTRAINT "returns_locationId_fkey";

-- DropIndex
DROP INDEX "custom_field_definitions_tenant_id_idx";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(6);

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "location_type" SET DEFAULT 'STORE';

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "return_items" ALTER COLUMN "restock" SET DEFAULT false;

-- AlterTable
ALTER TABLE "returns" DROP COLUMN "customerId",
DROP COLUMN "locationId",
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "location_id" TEXT NOT NULL,
ADD COLUMN     "return_number" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_parent_category_id_key" ON "categories"("tenant_id", "name", "parent_category_id");

-- CreateIndex
CREATE INDEX "custom_field_definitions_tenant_id_entity_type_idx" ON "custom_field_definitions"("tenant_id", "entity_type");

-- CreateIndex
CREATE INDEX "inventory_details_serial_number_idx" ON "inventory_details"("serial_number");

-- CreateIndex
CREATE INDEX "inventory_items_product_id_idx" ON "inventory_items"("product_id");

-- CreateIndex
CREATE INDEX "locations_is_active_idx" ON "locations"("is_active");

-- CreateIndex
CREATE INDEX "payments_returnId_idx" ON "payments"("returnId");

-- CreateIndex
CREATE INDEX "pos_session_transactions_related_order_id_idx" ON "pos_session_transactions"("related_order_id");

-- CreateIndex
CREATE INDEX "pos_sessions_pos_terminal_id_idx" ON "pos_sessions"("pos_terminal_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "returns_return_number_key" ON "returns"("return_number");

-- CreateIndex
CREATE INDEX "returns_location_id_idx" ON "returns"("location_id");

-- CreateIndex
CREATE INDEX "returns_customer_id_idx" ON "returns"("customer_id");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_restock_location_id_fkey" FOREIGN KEY ("restock_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
