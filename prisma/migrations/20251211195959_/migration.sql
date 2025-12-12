/*
  Warnings:

  - A unique constraint covering the columns `[tenant_id,count_number]` on the table `stock_counts` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PosAuditAction" AS ENUM ('ORDER_SUSPENDED', 'ORDER_RECALLED', 'ORDER_DELETED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'STOCK_OUT', 'EXPIRY_WARNING', 'PO_RECEIVED', 'PO_APPROVED', 'ORDER_PLACED', 'RETURN_REQUESTED', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'SUSPENDED';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'MOBILE_MONEY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PosTransactionType" ADD VALUE 'CARD_SALE';
ALTER TYPE "PosTransactionType" ADD VALUE 'MOBILE_MONEY_SALE';
ALTER TYPE "PosTransactionType" ADD VALUE 'CHECK_SALE';
ALTER TYPE "PosTransactionType" ADD VALUE 'BANK_TRANSFER_SALE';
ALTER TYPE "PosTransactionType" ADD VALUE 'OTHER_SALE';

-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'CLOSED';

-- DropIndex
DROP INDEX "stock_counts_count_number_key";

-- DropIndex
DROP INDEX "stock_counts_type_idx";

-- AlterTable
ALTER TABLE "inventory_transfer_items" ADD COLUMN     "conversion_factor" DECIMAL(19,4) DEFAULT 1,
ADD COLUMN     "uom_id" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "conversion_factor" DECIMAL(19,4) DEFAULT 1,
ADD COLUMN     "uom_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "conversion_factor" DECIMAL(19,4) DEFAULT 1,
ADD COLUMN     "uom_id" TEXT;

-- CreateTable
CREATE TABLE "user_locations" (
    "user_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("user_id","location_id")
);

-- CreateTable
CREATE TABLE "product_units" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conversion_factor" DECIMAL(19,4) NOT NULL,
    "barcode" TEXT,
    "cost_price" DECIMAL(19,4),
    "sale_price" DECIMAL(19,4),
    "is_default_purchase" BOOLEAN NOT NULL DEFAULT false,
    "is_default_sale" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "action" "PosAuditAction" NOT NULL,
    "order_id" TEXT,
    "order_number" TEXT,
    "order_tag" TEXT,
    "total_amount" DECIMAL(19,4),
    "item_count" INTEGER,
    "customer_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "location_id" TEXT,
    "type" "AlertType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "alert_type" "AlertType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_locations_location_id_idx" ON "user_locations"("location_id");

-- CreateIndex
CREATE INDEX "product_units_barcode_idx" ON "product_units"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_product_id_name_key" ON "product_units"("product_id", "name");

-- CreateIndex
CREATE INDEX "pos_audit_logs_tenant_id_idx" ON "pos_audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "pos_audit_logs_user_id_idx" ON "pos_audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "pos_audit_logs_location_id_idx" ON "pos_audit_logs"("location_id");

-- CreateIndex
CREATE INDEX "pos_audit_logs_order_id_idx" ON "pos_audit_logs"("order_id");

-- CreateIndex
CREATE INDEX "pos_audit_logs_action_idx" ON "pos_audit_logs"("action");

-- CreateIndex
CREATE INDEX "pos_audit_logs_created_at_idx" ON "pos_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_is_read_idx" ON "notifications"("tenant_id", "user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_dedupe_key_idx" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notification_preferences_tenant_id_idx" ON "notification_preferences"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_channel_alert_type_key" ON "notification_preferences"("user_id", "channel", "alert_type");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_tenant_id_count_number_key" ON "stock_counts"("tenant_id", "count_number");

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_audit_logs" ADD CONSTRAINT "pos_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_audit_logs" ADD CONSTRAINT "pos_audit_logs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_audit_logs" ADD CONSTRAINT "pos_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
