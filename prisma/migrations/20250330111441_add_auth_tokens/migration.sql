-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'KIT', 'BUNDLE', 'SERVICE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('WAREHOUSE', 'STORE', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('PURCHASE_RECEIPT', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CYCLE_COUNT', 'RETURN_RESTOCK', 'KIT_ASSEMBLY_CONSUME', 'KIT_ASSEMBLY_PRODUCE');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('POS', 'WEB', 'PHONE', 'MANUAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'GIFT_CARD', 'STORE_CREDIT', 'BANK_TRANSFER', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReturnItemCondition" AS ENUM ('SELLABLE', 'DAMAGED', 'DEFECTIVE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "PosSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "PosTransactionType" AS ENUM ('CASH_SALE', 'CASH_REFUND', 'PAY_IN', 'PAY_OUT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('EMAIL', 'SMS', 'SYSTEM');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "configuration" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_category_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "upc" TEXT,
    "ean" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_type" "ProductType" NOT NULL DEFAULT 'STANDARD',
    "unit_of_measure" TEXT DEFAULT 'each',
    "brand" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_stock_tracked" BOOLEAN NOT NULL DEFAULT true,
    "requires_serial_number" BOOLEAN NOT NULL DEFAULT false,
    "requires_lot_tracking" BOOLEAN NOT NULL DEFAULT false,
    "requires_expiry_date" BOOLEAN NOT NULL DEFAULT false,
    "base_price" DECIMAL(19,4),
    "cost_price" DECIMAL(19,4),
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "weight" DECIMAL(10,4),
    "weight_unit" TEXT,
    "dimensions" JSONB,
    "custom_attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "upc" TEXT,
    "ean" TEXT,
    "name" TEXT,
    "attributes" JSONB NOT NULL,
    "price_modifier" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "cost_modifier" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "weight_modifier" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "custom_attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_components" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_product_id" TEXT NOT NULL,
    "child_product_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_location_id" TEXT,
    "name" TEXT NOT NULL,
    "address" JSONB,
    "location_type" "LocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity_on_hand" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "quantity_allocated" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "quantity_incoming" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(19,4),
    "reorder_quantity" DECIMAL(19,4),
    "abc_category" CHAR(1),
    "last_counted_at" TIMESTAMP(3),
    "average_cost" DECIMAL(19,4),
    "custom_attributes" JSONB DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_details" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "lot_number" TEXT,
    "serial_number" TEXT,
    "expiry_date" DATE,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unit_cost" DECIMAL(19,4),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "transaction_id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "product_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "transaction_type" "InventoryTransactionType" NOT NULL,
    "quantity_change" DECIMAL(19,4) NOT NULL,
    "unit_cost" DECIMAL(19,4),
    "lot_number" TEXT,
    "serial_number" TEXT,
    "expiry_date" DATE,
    "related_order_id" TEXT,
    "related_order_item_id" TEXT,
    "related_po_id" TEXT,
    "related_po_item_id" TEXT,
    "related_transfer_id" TEXT,
    "related_adjustment_id" TEXT,
    "related_return_item_id" TEXT,
    "user_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_location_id" TEXT NOT NULL,
    "destination_location_id" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "transfer_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimated_delivery_date" DATE,
    "tracking_number" TEXT,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfer_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_requested" DECIMAL(19,4) NOT NULL,
    "quantity_shipped" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "quantity_received" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lot_number" TEXT,
    "serial_number" TEXT,

    CONSTRAINT "inventory_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "adjustment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason_code" TEXT,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "adjustment_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_change" DECIMAL(19,4) NOT NULL,
    "unit_cost" DECIMAL(19,4),
    "lot_number" TEXT,
    "serial_number" TEXT,

    CONSTRAINT "inventory_adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "payment_terms" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "custom_attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL,
    "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" DATE,
    "notes" TEXT,
    "shipping_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "description" TEXT,
    "quantity_ordered" DECIMAL(19,4) NOT NULL,
    "quantity_received" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(19,4) NOT NULL,
    "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(19,4) NOT NULL,
    "received_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company_name" TEXT,
    "loyalty_points" INTEGER NOT NULL DEFAULT 0,
    "customer_group_id" TEXT,
    "default_billing_address" JSONB,
    "default_shipping_address" JSONB,
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "custom_attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT,
    "location_id" TEXT NOT NULL,
    "pos_terminal_id" TEXT,
    "user_id" TEXT,
    "order_type" "OrderType" NOT NULL DEFAULT 'POS',
    "status" "OrderStatus" NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discount_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "shipping_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(19,4) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "notes" TEXT,
    "shipping_address" JSONB,
    "shipping_method" TEXT,
    "tracking_number" TEXT,
    "custom_attributes" JSONB DEFAULT '{}',
    "is_backordered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_snapshot" JSONB,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unit_price" DECIMAL(19,4) NOT NULL,
    "original_unit_price" DECIMAL(19,4),
    "discount_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(19,4) NOT NULL,
    "lot_number" TEXT,
    "serial_number" TEXT,
    "quantity_returned" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "custom_attributes" JSONB DEFAULT '{}',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "transaction_reference" TEXT,
    "payment_details" JSONB,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_by_user_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "original_order_id" TEXT NOT NULL,
    "return_order_id" TEXT,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "processed_by_user_id" TEXT,
    "total_refund_amount" DECIMAL(19,4),
    "status" "ReturnStatus" NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "original_order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unit_refund_amount" DECIMAL(19,4),
    "restock_location_id" TEXT,
    "condition" "ReturnItemCondition",
    "lot_number" TEXT,
    "serial_number" TEXT,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "pos_terminal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "starting_cash" DECIMAL(19,4) NOT NULL,
    "ending_cash" DECIMAL(19,4),
    "calculated_cash" DECIMAL(19,4),
    "difference" DECIMAL(19,4),
    "status" "PosSessionStatus" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_session_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pos_session_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transaction_type" "PosTransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "related_order_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "pos_session_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "config_key" TEXT NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "template_type" "NotificationType" NOT NULL,
    "event_trigger" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "log_id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE INDEX "custom_field_definitions_tenant_id_idx" ON "custom_field_definitions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_tenant_id_entity_type_field_key_key" ON "custom_field_definitions"("tenant_id", "entity_type", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON "roles"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_permission_key_key" ON "permissions"("permission_key");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");

-- CreateIndex
CREATE INDEX "categories_parent_category_id_idx" ON "categories"("parent_category_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");

-- CreateIndex
CREATE INDEX "product_variants_tenant_id_idx" ON "product_variants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_sku_key" ON "product_variants"("product_id", "sku");

-- CreateIndex
CREATE INDEX "product_components_tenant_id_idx" ON "product_components"("tenant_id");

-- CreateIndex
CREATE INDEX "product_components_child_product_id_idx" ON "product_components"("child_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_components_parent_product_id_child_product_id_key" ON "product_components"("parent_product_id", "child_product_id");

-- CreateIndex
CREATE INDEX "locations_tenant_id_idx" ON "locations"("tenant_id");

-- CreateIndex
CREATE INDEX "locations_parent_location_id_idx" ON "locations"("parent_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_tenant_id_name_key" ON "locations"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_idx" ON "inventory_items"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_items_location_id_idx" ON "inventory_items"("location_id");

-- CreateIndex
CREATE INDEX "inventory_items_updated_at_idx" ON "inventory_items"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenant_id_product_id_location_id_key" ON "inventory_items"("tenant_id", "product_id", "location_id");

-- CreateIndex
CREATE INDEX "inventory_details_inventory_item_id_idx" ON "inventory_details"("inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_details_tenant_id_idx" ON "inventory_details"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_details_lot_number_idx" ON "inventory_details"("lot_number");

-- CreateIndex
CREATE INDEX "inventory_details_expiry_date_idx" ON "inventory_details"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_details_tenant_id_serial_number_key" ON "inventory_details"("tenant_id", "serial_number");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenant_id_timestamp_idx" ON "inventory_transactions"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenant_id_product_id_location_id_tim_idx" ON "inventory_transactions"("tenant_id", "product_id", "location_id", "timestamp");

-- CreateIndex
CREATE INDEX "inventory_transactions_related_order_id_idx" ON "inventory_transactions"("related_order_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_related_po_id_idx" ON "inventory_transactions"("related_po_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_related_transfer_id_idx" ON "inventory_transactions"("related_transfer_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_related_adjustment_id_idx" ON "inventory_transactions"("related_adjustment_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_user_id_idx" ON "inventory_transactions"("user_id");

-- CreateIndex
CREATE INDEX "inventory_transfers_tenant_id_idx" ON "inventory_transfers"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_transfers_status_idx" ON "inventory_transfers"("status");

-- CreateIndex
CREATE INDEX "inventory_transfers_source_location_id_idx" ON "inventory_transfers"("source_location_id");

-- CreateIndex
CREATE INDEX "inventory_transfers_destination_location_id_idx" ON "inventory_transfers"("destination_location_id");

-- CreateIndex
CREATE INDEX "inventory_transfer_items_transfer_id_idx" ON "inventory_transfer_items"("transfer_id");

-- CreateIndex
CREATE INDEX "inventory_transfer_items_product_id_idx" ON "inventory_transfer_items"("product_id");

-- CreateIndex
CREATE INDEX "inventory_transfer_items_tenant_id_idx" ON "inventory_transfer_items"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_tenant_id_idx" ON "inventory_adjustments"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_location_id_idx" ON "inventory_adjustments"("location_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_adjustment_date_idx" ON "inventory_adjustments"("adjustment_date");

-- CreateIndex
CREATE INDEX "inventory_adjustment_items_adjustment_id_idx" ON "inventory_adjustment_items"("adjustment_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_items_product_id_idx" ON "inventory_adjustment_items"("product_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_items_tenant_id_idx" ON "inventory_adjustment_items"("tenant_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_name_key" ON "suppliers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_idx" ON "purchase_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_location_id_idx" ON "purchase_orders"("location_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_order_date_idx" ON "purchase_orders"("order_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_po_number_key" ON "purchase_orders"("tenant_id", "po_number");

-- CreateIndex
CREATE INDEX "purchase_order_items_po_id_idx" ON "purchase_order_items"("po_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_tenant_id_idx" ON "purchase_order_items"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_groups_tenant_id_idx" ON "customer_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_tenant_id_name_key" ON "customer_groups"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_customer_group_id_idx" ON "customers"("customer_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_email_key" ON "customers"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "orders_tenant_id_idx" ON "orders"("tenant_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_location_id_idx" ON "orders"("location_id");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_order_date_idx" ON "orders"("order_date");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_order_number_key" ON "orders"("tenant_id", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_idx" ON "order_items"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_payment_method_idx" ON "payments"("payment_method");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_return_order_id_key" ON "returns"("return_order_id");

-- CreateIndex
CREATE INDEX "returns_tenant_id_idx" ON "returns"("tenant_id");

-- CreateIndex
CREATE INDEX "returns_original_order_id_idx" ON "returns"("original_order_id");

-- CreateIndex
CREATE INDEX "returns_return_order_id_idx" ON "returns"("return_order_id");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE INDEX "return_items_return_id_idx" ON "return_items"("return_id");

-- CreateIndex
CREATE INDEX "return_items_original_order_item_id_idx" ON "return_items"("original_order_item_id");

-- CreateIndex
CREATE INDEX "return_items_product_id_idx" ON "return_items"("product_id");

-- CreateIndex
CREATE INDEX "return_items_tenant_id_idx" ON "return_items"("tenant_id");

-- CreateIndex
CREATE INDEX "pos_sessions_tenant_id_idx" ON "pos_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "pos_sessions_location_id_idx" ON "pos_sessions"("location_id");

-- CreateIndex
CREATE INDEX "pos_sessions_user_id_idx" ON "pos_sessions"("user_id");

-- CreateIndex
CREATE INDEX "pos_sessions_status_idx" ON "pos_sessions"("status");

-- CreateIndex
CREATE INDEX "pos_sessions_start_time_idx" ON "pos_sessions"("start_time");

-- CreateIndex
CREATE INDEX "pos_session_transactions_pos_session_id_idx" ON "pos_session_transactions"("pos_session_id");

-- CreateIndex
CREATE INDEX "pos_session_transactions_timestamp_idx" ON "pos_session_transactions"("timestamp");

-- CreateIndex
CREATE INDEX "pos_session_transactions_tenant_id_idx" ON "pos_session_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "configurations_tenant_id_idx" ON "configurations"("tenant_id");

-- CreateIndex
CREATE INDEX "configurations_config_key_idx" ON "configurations"("config_key");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_tenant_id_config_key_key" ON "configurations"("tenant_id", "config_key");

-- CreateIndex
CREATE INDEX "notification_templates_tenant_id_idx" ON "notification_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_templates_event_trigger_idx" ON "notification_templates"("event_trigger");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_template_name_key" ON "notification_templates"("tenant_id", "template_name");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_timestamp_idx" ON "audit_logs"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_child_product_id_fkey" FOREIGN KEY ("child_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_details" ADD CONSTRAINT "inventory_details_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_order_item_id_fkey" FOREIGN KEY ("related_order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_po_id_fkey" FOREIGN KEY ("related_po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_po_item_id_fkey" FOREIGN KEY ("related_po_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_transfer_id_fkey" FOREIGN KEY ("related_transfer_id") REFERENCES "inventory_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_adjustment_id_fkey" FOREIGN KEY ("related_adjustment_id") REFERENCES "inventory_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_return_item_id_fkey" FOREIGN KEY ("related_return_item_id") REFERENCES "return_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inventory_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_group_id_fkey" FOREIGN KEY ("customer_group_id") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processed_by_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_original_order_id_fkey" FOREIGN KEY ("original_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_return_order_id_fkey" FOREIGN KEY ("return_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_processed_by_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_original_order_item_id_fkey" FOREIGN KEY ("original_order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_restock_location_id_fkey" FOREIGN KEY ("restock_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_session_transactions" ADD CONSTRAINT "pos_session_transactions_pos_session_id_fkey" FOREIGN KEY ("pos_session_id") REFERENCES "pos_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_session_transactions" ADD CONSTRAINT "pos_session_transactions_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
