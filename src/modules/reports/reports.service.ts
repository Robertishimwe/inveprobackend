// src/modules/reports/reports.service.ts
import httpStatus from 'http-status';
import {
    Prisma, OrderStatus, PurchaseOrderStatus, PosSessionStatus, PaymentStatus
} from '@prisma/client';
import { prisma } from '@/config'; // Use default prisma, route queries to replica via config/proxy
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { ReportQueryDto } from './dto/report-query.dto'; // Assuming shared DTO
import {
    SalesSummary, InventoryOnHandItem, DashboardKpiData, // Main report types
    SalesByProductItem, InventoryValuationItem, LowStockItem, // Other subtypes
    InventoryLedgerEntry // POS Reports
} from './reporting.types';
import { // Import date helpers (you'll need to create these)
    getDateRange// Assumed utils
} from '@/utils/date.utils'; // Example path
// import pick from '@/utils/pick';

// Define log context type if not already defined globally
type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; params?: any; error?: any; [key: string]: any; };

// --- Helper: Calculate Percentage Change ---
const calculateChange = (current: number | Prisma.Decimal | null | undefined, previous: number | Prisma.Decimal | null | undefined): number | null => {
    const currentNum = typeof current === 'number' ? current : current?.toNumber() ?? 0;
    const previousNum = typeof previous === 'number' ? previous : previous?.toNumber() ?? 0;

    if (previousNum === 0) {
        // Handle division by zero: if current is also 0, change is 0%; if current is non-zero, change is infinite (return null or a large number?)
        return currentNum === 0 ? 0 : null; // Indicate undefined change if previous was zero and current is not
    }
    // Calculate percentage change, round to 1 decimal place
    const change = ((currentNum - previousNum) / previousNum) * 100;
    return parseFloat(change.toFixed(1));
};


// --- Service Implementations ---

/**
 * Fetches Key Performance Indicators for the dashboard.
 * Optimized with parallel Prisma aggregates and one targeted raw query.
 */
const getDashboardKpis = async (tenantId: string, params: Pick<ReportQueryDto, 'period' | 'locationId'>): Promise<DashboardKpiData> => {
    const logContext: LogContext = { function: 'getDashboardKpis', tenantId, params };
    const startTime = Date.now();
    logger.info(`Fetching dashboard KPIs`, logContext);

    try {
        const { currentRange, previousRange } = getDateRange(params.period ?? 'today'); // Get current/previous date ranges
        logContext.currentRange = { start: currentRange.start.toISOString(), end: currentRange.end.toISOString() };
        logContext.previousRange = { start: previousRange.start.toISOString(), end: previousRange.end.toISOString() };

        const locationFilter = params.locationId ? { locationId: params.locationId } : {};
        const completedOrderStatus: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.SHIPPED]; // Define 'sale' statuses

        // --- Run KPI queries in parallel ---
        const kpiPromises = [
            // 0: Sales Data (Current Period)
            prisma.order.aggregate({
                _sum: { totalAmount: true, discountAmount: true }, // Sum total and discount
                _count: { id: true }, // Count orders
                where: { tenantId, ...locationFilter, status: { in: completedOrderStatus }, createdAt: { gte: currentRange.start, lte: currentRange.end } },
            }),
            // 1: Sales Data (Previous Period)
            prisma.order.aggregate({
                _sum: { totalAmount: true }, // Only need total amount for comparison base
                _count: { id: true },
                where: { tenantId, ...locationFilter, status: { in: completedOrderStatus }, createdAt: { gte: previousRange.start, lte: previousRange.end } },
            }),
            // 2: Refund Data (Current Period) - Assuming refunds are stored in Payment table linked to Return
             prisma.payment.aggregate({
                 _sum: { amount: true },
                 where: { tenantId, returnId: { not: null }, status: PaymentStatus.COMPLETED, createdAt: { gte: currentRange.start, lte: currentRange.end }, /* location join? */ }
                 // Note: Linking refunds accurately might require joining via Return -> Order -> Location if filtering by location
             }),
            // 3: Refund Data (Previous Period)
             prisma.payment.aggregate({
                 _sum: { amount: true },
                 where: { tenantId, returnId: { not: null }, status: PaymentStatus.COMPLETED, createdAt: { gte: previousRange.start, lte: previousRange.end }, /* location join? */ }
             }),
            // 4: Inventory Value (Raw Query for SUM(qoh * cost))
            prisma.$queryRaw<[{ total_value: number | null }]>`
                SELECT SUM(quantity_on_hand * average_cost) as total_value
                FROM inventory_items
                WHERE tenant_id = ${tenantId}
                ${params.locationId ? Prisma.sql`AND location_id = ${params.locationId}` : Prisma.empty}
                AND quantity_on_hand > 0 AND average_cost IS NOT NULL
            `,
            // 5: Low Stock Count (Simple version: QOH <= 0)
            prisma.inventoryItem.count({
                 where: { tenantId, ...locationFilter, quantityOnHand: { lte: 0 }, product: { isStockTracked: true, isActive: true } }
            }),
            // 6: Pending POs
            prisma.purchaseOrder.count({
                where: { tenantId, ...locationFilter, status: { in: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] } }
            }),
            // 7: Open POS Sessions
            prisma.posSession.count({
                 where: { tenantId, ...locationFilter, status: PosSessionStatus.OPEN }
            }),
        ];

        const results = await Promise.all(kpiPromises);

        // --- Process Results ---
        const [
            salesDataCurrent, salesDataPrevious, refundDataCurrent, refundDataPrevious,
            inventoryValueResult, lowStockData, pendingPOData, openSessionData
        ] = results as [
            Prisma.GetOrderAggregateType<{ _sum: { totalAmount: true, discountAmount: true }, _count: { id: true } }>, // Type correctly
            Prisma.GetOrderAggregateType<{ _sum: { totalAmount: true }, _count: { id: true } }>,
            Prisma.GetPaymentAggregateType<{ _sum: { amount: true } }>,
            Prisma.GetPaymentAggregateType<{ _sum: { amount: true } }>,
            [{ total_value: number | null }],
            number, number, number
        ];

        const currentGrossSales = salesDataCurrent._sum.totalAmount ?? new Prisma.Decimal(0);
        const currentRefunds = refundDataCurrent._sum.amount ?? new Prisma.Decimal(0); // Assume refunds stored positive
        const currentNetSales = currentGrossSales.minus(currentRefunds); // Simple Net Sales calc
        const currentTransactions = salesDataCurrent._count.id ?? 0;

        const previousGrossSales = salesDataPrevious._sum.totalAmount ?? new Prisma.Decimal(0);
        const previousRefunds = refundDataPrevious._sum.amount ?? new Prisma.Decimal(0);
        const previousNetSales = previousGrossSales.minus(previousRefunds);
        const previousTransactions = salesDataPrevious._count.id ?? 0;

        const currentInventoryValue = new Prisma.Decimal(inventoryValueResult[0]?.total_value ?? 0);

        // --- Assemble KPI Object ---
        const kpis: DashboardKpiData = {
            netSales: {
                current: currentNetSales.toFixed(2), // Format as string
                previous: previousNetSales.toFixed(2),
                changePercent: calculateChange(currentNetSales, previousNetSales),
            },
            transactions: {
                current: currentTransactions,
                previous: previousTransactions,
                changePercent: calculateChange(currentTransactions, previousTransactions),
            },
            averageTransactionValue: {
                current: currentTransactions > 0 ? currentNetSales.dividedBy(currentTransactions).toFixed(2) : "0.00",
                previous: previousTransactions > 0 ? previousNetSales.dividedBy(previousTransactions).toFixed(2) : "0.00",
                changePercent: calculateChange(
                    currentTransactions > 0 ? currentNetSales.dividedBy(currentTransactions) : 0,
                    previousTransactions > 0 ? previousNetSales.dividedBy(previousTransactions) : 0
                ),
            },
            inventoryValue: { current: currentInventoryValue.toFixed(2) },
            lowStockCount: { current: lowStockData },
            pendingPOs: { current: pendingPOData },
            openPosSessions: { current: openSessionData },
        };

        const endTime = Date.now();
        logger.info(`Dashboard KPIs fetched successfully. Duration: ${endTime - startTime}ms`, logContext);
        return kpis;

    } catch (error: any) {
         logContext.error = error;
         logger.error(`Error fetching dashboard KPIs`, logContext);
         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve dashboard KPIs.');
    }
};




















/** Get Sales Summary report data based on filters */
const getSalesSummary = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId' | 'userId'>): Promise<SalesSummary> => {
     const logContext: LogContext = { function: 'getSalesSummary', tenantId, params };
     const startTime = Date.now();

    // const { start, end } = getDateRange(undefined, params.startDate, params.endDate);
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate); // Use custom if dates provided
    const { start, end } = currentRange; // Destructure from currentRange

    logContext.dateRange = { start: start.toISOString(), end: end.toISOString() };

    const whereFilter: Prisma.OrderWhereInput = {
        tenantId,
        status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
        createdAt: { gte: start, lte: end }
    };
    if (params.locationId) whereFilter.locationId = params.locationId;
    if (params.userId) whereFilter.userId = params.userId; // Sales by specific staff

    try {
        // Use aggregate for totals
        const aggregateResult = await prisma.order.aggregate({
            _sum: { totalAmount: true, discountAmount: true, taxAmount: true, shippingCost: true, subtotal: true },
            _count: { id: true },
            where: whereFilter,
        });

        // Query separately for associated refunds in the period
        const refundResult = await prisma.payment.aggregate({
            _sum: { amount: true },
            where: {
                tenantId,
                returnId: { not: null }, // It's a refund payment linked to a return
                status: PaymentStatus.COMPLETED,
                createdAt: { gte: start, lte: end }, // Refund processed in the period
                // Optionally link back to orders created in the period? Or just all refunds in period?
                // order: whereFilter // This would filter refunds only for orders CREATED in the period
            }
        });

        const grossSales = aggregateResult._sum.totalAmount ?? new Prisma.Decimal(0);
        const totalOrders = aggregateResult._count.id ?? 0;
        const totalDiscounts = aggregateResult._sum.discountAmount ?? new Prisma.Decimal(0);
        const totalTax = aggregateResult._sum.taxAmount ?? new Prisma.Decimal(0);
        const totalShipping = aggregateResult._sum.shippingCost ?? new Prisma.Decimal(0);
        const totalReturns = refundResult._sum.amount ?? new Prisma.Decimal(0); // Assume positive refund amount stored
        const netSales = grossSales.minus(totalReturns); // Simple Net Sales

        const summary: SalesSummary = {
            period: { start: start.toISOString(), end: end.toISOString() },
            totalOrders: totalOrders,
            grossSales: grossSales.toFixed(2),
            totalDiscounts: totalDiscounts.toFixed(2),
            totalReturns: totalReturns.toFixed(2),
            netSales: netSales.toFixed(2),
            totalTax: totalTax.toFixed(2),
            totalShipping: totalShipping.toFixed(2),
            averageOrderValue: totalOrders > 0 ? netSales.dividedBy(totalOrders).toFixed(2) : "0.00",
            // COGS and Profit require fetching transaction costs - complex, omitted here
        };

         const endTime = Date.now();
         logger.info(`Sales summary fetched successfully. Duration: ${endTime - startTime}ms`, logContext);
         return summary;

    } catch (error: any) {
         logContext.error = error;
         logger.error(`Error fetching sales summary`, logContext);
         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sales summary.');
    }
};



















/** Get Inventory On Hand report */
const getInventoryOnHand = async (tenantId: string, params: Pick<ReportQueryDto, 'locationId' | 'productId' | 'categoryId'>): Promise<InventoryOnHandItem[]> => {
    const logContext: LogContext = { function: 'getInventoryOnHand', tenantId, params };
    const startTime = Date.now();

    const whereFilter: Prisma.InventoryItemWhereInput = { tenantId };
    if (params.locationId) whereFilter.locationId = params.locationId;
    if (params.productId) whereFilter.productId = params.productId;
    // Add category filter if needed (requires checking product relation)
    // if (params.categoryId) {
    //     whereFilter.product = { ...whereFilter.product, categories: { some: { categoryId: params.categoryId }}};
    // }
    // if (params.categoryId) {
    //     // Nest the category filter inside the 'product' relation filter
    //     whereFilter.product = {
    //         ...whereFilter.product, // Keep existing product filters if any
    //         categories: {
    //             some: { // Check if product is linked to *at least one* category with the ID
    //                 categoryId: params.categoryId
    //             }
    //         }
    //     };
    // }

        // --- FIX: Correctly add related Product filters ---
    // Initialize product filter if needed
    // let productFilter: Prisma.ProductWhereInput = {};
    // let hasProductFilter = false;

    // // Add Category Filter (nested within Product filter)
    // if (params.categoryId) {
    //     productFilter.categories = { // Filter on the 'categories' relation
    //         some: { // Product must be in at least one category matching this...
    //             categoryId: params.categoryId // ...category ID
    //         }
    //     };
    //     hasProductFilter = true;
    // }


 // Correctly add related Product filters
 let productFilter: Prisma.ProductWhereInput = {};
 // --- FIX: Use the hasProductFilter flag ---
 let hasProductFilter = false; // Initialize flag

 // Add Category Filter (nested within Product filter)
 if (params.categoryId) {
     productFilter.categories = {
         some: {
             categoryId: params.categoryId
         }
     };
     hasProductFilter = true; // Set flag to true as we added a filter
 }

 // Add other potential product-level filters here if needed
 // if (params.productIsActive !== undefined) {
 //     productFilter.isActive = params.productIsActive === 'true';
 //     hasProductFilter = true;
 // }

 // Assign the product filter to the main where clause ONLY if it has conditions
 if (hasProductFilter) { // <<< Use the flag here
     whereFilter.product = productFilter;
 }
 // --- End of FIX ---

    // Optionally add filter for non-zero stock: whereFilter.quantityOnHand = { not: 0 };

    try {
        const items = await prisma.inventoryItem.findMany({
            where: whereFilter,
            select: {
                productId: true, locationId: true, quantityOnHand: true, quantityAllocated: true,
                averageCost: true, // Use average cost for valuation
                product: { select: { sku: true, name: true } },
                location: { select: { name: true } },
            },
            orderBy: [ { location: { name: 'asc' } }, { product: { name: 'asc' } } ]
            // Add pagination if needed
        });

        const reportItems: InventoryOnHandItem[] = items.map(item => {
            const quantityOnHand = item.quantityOnHand;
            const quantityAllocated = item.quantityAllocated;
            const quantityAvailable = quantityOnHand.minus(quantityAllocated);
            const unitCost = item.averageCost;
            const totalValue = unitCost ? quantityOnHand.times(unitCost) : null; // Calculate total value

            return {
                productId: item.productId,
                sku: item.product.sku,
                productName: item.product.name,
                locationId: item.locationId,
                locationName: item.location.name,
                quantityOnHand: quantityOnHand.toFixed(4), // Format as string with decimals
                quantityAllocated: quantityAllocated.toFixed(4),
                quantityAvailable: quantityAvailable.toFixed(4),
                unitCost: unitCost?.toFixed(4) ?? null,
                totalValue: totalValue?.toFixed(2) ?? null, // Format currency
            };
        });

        const endTime = Date.now();
        logger.info(`Inventory on hand fetched successfully. Items: ${reportItems.length}. Duration: ${endTime - startTime}ms`, logContext);
        return reportItems;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching inventory on hand`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve inventory on hand.');
    }
};

// --- Placeholder Implementations for Other Reports ---

const getSalesByProduct = async (tenantId: string, params: ReportQueryDto): Promise<SalesByProductItem[]> => {
    logger.warn("getSalesByProduct service function not implemented.");
    // TODO: Implementation using Prisma aggregate group By product, sum quantities/totals from OrderItems within date range/filters
    return [];
};

const getInventoryValuation = async (tenantId: string, params: ReportQueryDto): Promise<InventoryValuationItem[]> => {
    logger.warn("getInventoryValuation service function not implemented. Requires complex FIFO/LIFO or uses Average Cost.");
     // If using Average Cost, query like getInventoryOnHand and return that value.
     // If FIFO/LIFO, need complex logic querying InventoryTransaction history.
    return [];
};

const getLowStock = async (tenantId: string, params: ReportQueryDto): Promise<LowStockItem[]> => {
     logger.warn("getLowStock service function not fully implemented (reorder point comparison limitations).");
     // TODO: Implement using threshold filters or potentially raw SQL for direct column comparison if needed.
     return [];
};

const getInventoryMovementLedger = async (tenantId: string, params: ReportQueryDto): Promise<InventoryLedgerEntry[]> => {
     logger.warn("getInventoryMovementLedger service function not implemented.");
     // TODO: Implementation querying InventoryTransaction table with includes for product/location/user names, filtering, sorting, pagination.
     return [];
};

// Add similar stubs or full implementations for:
// getSalesByCategory, getSalesByLocation, getSalesByStaff, getPaymentMethodsSummary, getTaxSummary,
// getInventoryAdjustmentReport, getInventoryTransferReport, getPurchaseOrderSummary,
// getPurchaseOrderDetailReport, getCustomerPurchaseHistory, getTopCustomers, getPosSessionReport

export const reportingService = {
    getDashboardKpis,
    getSalesSummary,
    getInventoryOnHand,
    getSalesByProduct,
    getInventoryValuation,
    getLowStock,
    getInventoryMovementLedger,
    // ... export other implemented report functions
};

// --- Date Utils Placeholder (needs implementation in src/utils/date.utils.ts) ---
// Example structure:
// function getDateRange(period = 'today', startDate?: string, endDate?: string): { start: Date, end: Date, previousRange: { start: Date, end: Date } } {
//     // ... logic to calculate start/end dates for current and previous periods ...
//     return { start, end, previousRange };
// }
// function getPriorDateRange(currentStart: Date, currentEnd: Date): { start: Date, end: Date } {
//     // ... logic to calculate previous range based on current range duration ...
//     return { start: previousStart, end: previousEnd };
// }
// function getStartOfDay(date: Date): Date { /* ... */ }
// function getEndOfDay(date: Date): Date { /* ... */ }