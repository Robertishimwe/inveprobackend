// src/modules/reports/reporting.types.ts

import {
    Product,
    PaymentMethod,
    OrderStatus,
    PurchaseOrderStatus,
    PurchaseOrderItem,
    PosSessionStatus,
    TransferStatus,
    InventoryTransactionType
} from '@prisma/client'; // Import Prisma Decimal and relevant model types/enums

// ==========================================
// Common Filter / Parameter Types (Optional)
// ==========================================
// While the DTO handles input validation, internal functions might use stricter types
export interface DateRange {
    start: Date;
    end: Date;
}

export interface ReportContext {
    tenantId: string;
    userId?: string; // ID of user requesting the report
    locationId?: string | null; // Optional location filter
}

export interface ReportFilters extends ReportContext {
    dateRange: DateRange;
    productId?: string | null;
    categoryId?: string | null;
    supplierId?: string | null;
    customerId?: string | null;
    staffUserId?: string | null; // For filtering by salesperson/user
    status?: string | null; // For filtering by order/PO/transfer status
    // Add other common filters
}

export interface Pagination {
    limit: number;
    offset: number; // Calculated from page and limit
}

export interface Sorting {
    field: string;
    direction: 'asc' | 'desc';
}

// ==========================================
// Sales Report Types
// ==========================================

export interface SalesSummary {
    period: { start: string; end: string; }; // ISO date strings
    totalOrders: number;                    // Count of COMPLETED/SHIPPED orders in period
    grossSales: string;                     // Sum of Order.totalAmount (before refunds, as string for precision)
    totalDiscounts: string;                 // Sum of Order.discountAmount + Sum(OrderItem.discountAmount)
    totalReturns: string;                   // Sum of Return.totalRefundAmount (absolute value)
    netSales: string;                       // Calculated: grossSales - totalReturns
    totalTax: string;                       // Sum of Order.taxAmount
    totalShipping: string;                  // Sum of Order.shippingCost
    cogs?: string | null;                   // Cost of Goods Sold (Optional, requires fetching cost from transactions)
    grossProfit?: string | null;            // Calculated: netSales - cogs
    averageOrderValue: string;              // Calculated: netSales / totalOrders
}

export interface SalesByProductItem {
    productId: string;
    sku: string;
    productName: string;
    quantitySold: string; // Sum of OrderItem.quantity for completed orders
    grossSales: string;   // Sum of OrderItem.lineTotal (or calculated from price*qty)
    totalDiscounts: string;// Sum of OrderItem.discountAmount
    netSales: string;     // Gross sales - estimated return value for this product? Or based on returns table.
    cogs?: string | null;
    grossProfit?: string | null;
}

export interface SalesByCategoryItem {
    categoryId: string;
    categoryName: string;
    quantitySold: string;
    grossSales: string;
    netSales: string;
    grossProfit?: string | null;
}

export interface SalesByLocationItem {
    locationId: string;
    locationName: string;
    totalOrders: number;
    grossSales: string;
    netSales: string;
    grossProfit?: string | null;
}

export interface SalesByStaffItem {
    userId: string;
    staffName: string; // Combination of firstName lastName
    totalOrders: number;
    grossSales: string;
    netSales: string;
    averageOrderValue: string;
}

export interface PaymentMethodsSummaryItem {
    paymentMethod: PaymentMethod;
    totalAmount: string;
    transactionCount: number;
    refundAmount: string; // Sum of refund payments using this method
    netAmount: string;    // totalAmount - refundAmount
}

export interface TaxSummaryItem {
    // Grouping depends on requirements (e.g., by tax rate, jurisdiction)
    taxRate?: string | null; // Example: group by rate
    taxableSales: string; // Sum of line/order totals that were taxable
    taxCollected: string; // Sum of calculated taxAmount
    reportingPeriod: { start: string; end: string; };
}


// ==========================================
// Inventory Report Types
// ==========================================

export interface InventoryOnHandItem {
    productId: string;
    sku: string;
    productName: string;
    locationId: string;
    locationName: string;
    quantityOnHand: string;     // Current QOH as string
    quantityAllocated: string;  // Current Allocated Qty as string
    quantityAvailable: string;  // Calculated: onHand - allocated, as string
    unitCost?: string | null;   // e.g., average cost from InventoryItem
    totalValue?: string | null; // Calculated: onHand * unitCost, as string
    // Optionally add: quantityIncoming, reorderPoint etc. from InventoryItem
}

export interface InventoryValuationItem extends InventoryOnHandItem {
    valuationMethod: 'AVERAGE_COST' | 'FIFO' | 'LIFO'; // Indicate method used
    // `totalValue` calculated using the specified method
}

export interface LowStockItem {
    productId: string;
    sku: string;
    productName: string;
    locationId: string;
    locationName: string;
    quantityOnHand: string;
    quantityAvailable: string;
    reorderPoint: string | null;
    quantityBelowReorder: string | null; // Calculated: reorderPoint - quantityOnHand (if positive)
    quantityIncoming?: string | null; // Useful context
}

// Represents a single line in the inventory movement ledger
export interface InventoryLedgerEntry {
    transactionId: string; // BigInt represented as string
    timestamp: string;     // ISO timestamp string
    productId: string;
    sku: string;
    productName: string;
    locationId: string;
    locationName: string;
    transactionType: InventoryTransactionType;
    quantityChange: string;
    quantityAfter?: string | null; // Optional: Calculated running balance
    unitCost?: string | null;
    totalCostChange?: string | null; // Calculated: quantityChange * unitCost
    userId?: string | null;
    userName?: string | null;
    relatedDocumentType?: 'Order' | 'PO' | 'Transfer' | 'Adjustment' | 'Return' | null;
    relatedDocumentId?: string | null; // e.g., Order ID, PO ID
    notes?: string | null;
    lotNumber?: string | null;
    serialNumber?: string | null;
}

// Summary report for adjustments over a period
export interface InventoryAdjustmentReportItem {
    adjustmentId: string;
    adjustmentDate: string; // ISO date string
    locationId: string;
    locationName: string;
    reasonCode?: string | null;
    notes?: string | null;
    itemCount: number;
    totalValueChange?: string | null; // Sum of (quantityChange * unitCost) for items
    createdByUserId?: string | null;
    createdByUserName?: string | null;
}

// Summary report for transfers over a period
export interface InventoryTransferReportItem {
    transferId: string;
    transferDate: string; // ISO date string
    status: TransferStatus;
    sourceLocationId: string;
    sourceLocationName: string;
    destinationLocationId: string;
    destinationLocationName: string;
    itemCount: number;
    createdByUserId?: string | null;
    createdByUserName?: string | null;
    // Optionally add total value transferred? Requires cost info.
}

// ==========================================
// Purchase Order Report Types
// ==========================================

export interface PurchaseOrderSummaryItem {
    poId: string;
    poNumber: string;
    orderDate: string;
    expectedDeliveryDate?: string | null;
    supplierId: string;
    supplierName: string;
    locationId: string; // Delivery Location
    locationName: string;
    status: PurchaseOrderStatus;
    itemCount: number;
    totalAmount: string;
    amountReceivedValue?: string | null; // Optional: Calculated value received so far
    isOverdue: boolean; // Calculated based on expected date and current date/status
}

export interface PurchaseOrderDetailReportItem extends PurchaseOrderSummaryItem {
    // Include details from PurchaseOrderWithDetails if needed for a detail report
    items: (PurchaseOrderItem & { product: Pick<Product, 'id'|'sku'|'name'> })[];
    notes?: string | null;
    shippingCost: string;
    taxAmount: string;
    subtotal: string;
    // ... other fields from PurchaseOrder ...
}

// ==========================================
// Customer Report Types
// ==========================================

export interface CustomerPurchaseHistoryItem {
    orderId: string;
    orderNumber: string;
    orderDate: string;
    totalAmount: string;
    status: OrderStatus;
    itemCount: number;
}

export interface TopCustomerItem {
    customerId: string;
    customerName: string; // Combine first/last/company
    email?: string | null;
    totalSpent: string; // Sum of completed Order.totalAmount
    orderCount: number;
    lastPurchaseDate?: string | null;
}


// ==========================================
// POS Report Types
// ==========================================

// Represents the data typically found on a Z-Report (End-of-Day Summary)
export interface PosSessionReport {
    sessionId: string;
    startTime: string;
    endTime?: string | null;
    locationId: string;
    locationName: string;
    terminalId: string;
    userId: string;
    userName: string;
    status: PosSessionStatus;

    startingCash: string;
    endingCash?: string | null; // Counted
    calculatedCash?: string | null; // System expected
    difference?: string | null;

    totalCashSales: string; // Sum of CASH_SALE transaction amounts
    totalCashRefunds: string; // Sum of CASH_REFUND transaction amounts
    totalPayIns: string; // Sum of PAY_IN amounts (excluding initial float)
    totalPayOuts: string; // Sum of PAY_OUT amounts
    netCashChange: string; // Calculated: (Cash Sales + Pay Ins) - (Cash Refunds + Pay Outs)
    expectedCashInDrawer: string; // Calculated: startingCash + netCashChange

    // Include summaries of other payment methods for this session
    cardSalesTotal?: string;
    giftCardSalesTotal?: string;
    storeCreditSalesTotal?: string;
    otherSalesTotal?: string;

    grossSalesInSession: string; // Sum of totalAmount for orders created during session
    netSalesInSession: string; // Gross Sales - Refunds processed during session
    taxCollectedInSession: string;
    discountsGivenInSession: string;
    totalTransactions: number; // Count of Orders created in session
    averageTransactionValue: string;
}


// ==========================================
// Dashboard KPI Types
// ==========================================

// Re-defined here for clarity within this file
export interface KpiValue {
    current: string | number;      // Current period value (use string for decimals)
    previous?: string | number | null;    // Previous period value
    changePercent?: number | null; // Percentage change (e.g., 10.5 for +10.5%)
}

export interface DashboardKpiData {
    netSales: KpiValue;
    transactions: KpiValue; // Number of orders/sales
    averageTransactionValue: KpiValue;
    inventoryValue: { current: string }; // Current total inventory value
    lowStockCount: { current: number }; // Number of items below reorder point
    pendingPOs: { current: number }; // Count of POs in APPROVED/SENT/PARTIALLY_RECEIVED status
    openPosSessions: { current: number }; // Count of sessions currently OPEN
    // Add more KPIs: top product, return rate, gross profit margin, etc.
}
