-- AlterEnum
ALTER TYPE "TenantStatus" ADD VALUE 'DEACTIVATED';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "deactivated_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");
