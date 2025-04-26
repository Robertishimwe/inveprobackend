-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('PENDING', 'COUNTING', 'REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountType" AS ENUM ('FULL', 'CYCLE');

-- CreateEnum
CREATE TYPE "StockCountItemStatus" AS ENUM ('PENDING', 'COUNTED', 'RECOUNT_REQUESTED', 'APPROVED', 'SKIPPED');

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "count_number" TEXT,
    "status" "StockCountStatus" NOT NULL DEFAULT 'PENDING',
    "type" "StockCountType" NOT NULL,
    "initiated_by_user_id" TEXT NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "stock_count_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "snapshot_quantity" DECIMAL(19,4) NOT NULL,
    "counted_quantity" DECIMAL(19,4),
    "variance_quantity" DECIMAL(19,4),
    "unit_cost_at_snapshot" DECIMAL(19,4),
    "status" "StockCountItemStatus" NOT NULL DEFAULT 'PENDING',
    "counted_by_user_id" TEXT,
    "counted_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "lotNumber" TEXT,
    "serialNumber" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_count_number_key" ON "stock_counts"("count_number");

-- CreateIndex
CREATE INDEX "stock_counts_tenant_id_idx" ON "stock_counts"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_counts_location_id_idx" ON "stock_counts"("location_id");

-- CreateIndex
CREATE INDEX "stock_counts_status_idx" ON "stock_counts"("status");

-- CreateIndex
CREATE INDEX "stock_counts_type_idx" ON "stock_counts"("type");

-- CreateIndex
CREATE INDEX "stock_counts_initiated_at_idx" ON "stock_counts"("initiated_at");

-- CreateIndex
CREATE INDEX "stock_count_items_tenant_id_idx" ON "stock_count_items"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_count_items_stock_count_id_idx" ON "stock_count_items"("stock_count_id");

-- CreateIndex
CREATE INDEX "stock_count_items_product_id_idx" ON "stock_count_items"("product_id");

-- CreateIndex
CREATE INDEX "stock_count_items_status_idx" ON "stock_count_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_items_stock_count_id_product_id_lotNumber_seria_key" ON "stock_count_items"("stock_count_id", "product_id", "lotNumber", "serialNumber");

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_counted_by_user_id_fkey" FOREIGN KEY ("counted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
