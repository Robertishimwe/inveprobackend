-- AlterTable
CREATE SEQUENCE IF NOT EXISTS "GlobalPoNumberSeq" START 1;

ALTER TABLE "purchase_order_items" ADD COLUMN     "tax_amount" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0;
