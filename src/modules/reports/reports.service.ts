// src/modules/reports/reports.service.ts
import httpStatus from 'http-status';
import {
    Prisma, OrderStatus, PurchaseOrderStatus, PosSessionStatus, PaymentStatus
} from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { ReportQueryDto } from './dto/report-query.dto';
import {
    SalesSummary, InventoryOnHandItem, DashboardKpiData
} from './reporting.types';
import { getDateRange } from '@/utils/date.utils';
import {
    getSalesByCategory,
    getSalesByLocation,
    getPaymentMethodsSummary,
    getSalesByProduct,
    getInventoryValuation,
    getLowStock,
    getSalesByStaff,
    getTaxSummary,
    getInventoryMovementLedger,
    getInventoryAdjustmentReport,
    getInventoryTransferReport,
    getPurchaseOrderSummary,
    getPurchaseOrderDetailReport,
    getCustomerPurchaseHistory,
    getTopCustomers,
    getPosSessionReport,
    getSalesChartData
} from './reports.service.extended';

type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; params?: any; error?: any;[key: string]: any; };

const calculateChange = (current: number | Prisma.Decimal | null | undefined, previous: number | Prisma.Decimal | null | undefined): number | null => {
    const currentNum = typeof current === 'number' ? current : current?.toNumber() ?? 0;
    const previousNum = typeof previous === 'number' ? previous : previous?.toNumber() ?? 0;

    if (previousNum === 0) {
        return currentNum === 0 ? 0 : null;
    }
    const change = ((currentNum - previousNum) / previousNum) * 100;
    return parseFloat(change.toFixed(1));
};

const getDashboardKpis = async (tenantId: string, params: Pick<ReportQueryDto, 'period' | 'locationId' | 'startDate' | 'endDate'>): Promise<DashboardKpiData> => {
    const logContext: LogContext = { function: 'getDashboardKpis', tenantId, params };
    const startTime = Date.now();
    logger.info(`Fetching dashboard KPIs`, logContext);

    try {
        const { currentRange, previousRange } = getDateRange(params.period ?? (params.startDate ? 'custom' : 'today'), params.startDate, params.endDate);
        logContext.currentRange = { start: currentRange.start.toISOString(), end: currentRange.end.toISOString() };
        logContext.previousRange = { start: previousRange.start.toISOString(), end: previousRange.end.toISOString() };

        const locationFilter = params.locationId ? { locationId: params.locationId } : {};
        const completedOrderStatus: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.SHIPPED];

        const kpiPromises = [
            prisma.order.aggregate({
                _sum: { totalAmount: true, discountAmount: true },
                _count: { id: true },
                where: { tenantId, ...locationFilter, status: { in: completedOrderStatus }, createdAt: { gte: currentRange.start, lte: currentRange.end } },
            }),
            prisma.order.aggregate({
                _sum: { totalAmount: true },
                _count: { id: true },
                where: { tenantId, ...locationFilter, status: { in: completedOrderStatus }, createdAt: { gte: previousRange.start, lte: previousRange.end } },
            }),
            prisma.payment.aggregate({
                _sum: { amount: true },
                where: { tenantId, returnId: { not: null }, status: PaymentStatus.COMPLETED, createdAt: { gte: currentRange.start, lte: currentRange.end } }
            }),
            prisma.payment.aggregate({
                _sum: { amount: true },
                where: { tenantId, returnId: { not: null }, status: PaymentStatus.COMPLETED, createdAt: { gte: previousRange.start, lte: previousRange.end } }
            }),
            prisma.$queryRaw<[{ total_value: number | null }]>`
                SELECT SUM(quantity_on_hand * average_cost) as total_value
                FROM inventory_items
                WHERE tenant_id = ${tenantId}
                ${params.locationId ? Prisma.sql`AND location_id = ${params.locationId}` : Prisma.empty}
                AND quantity_on_hand > 0 AND average_cost IS NOT NULL
            `,
            prisma.inventoryItem.count({
                where: { tenantId, ...locationFilter, quantityOnHand: { lte: 0 }, product: { isStockTracked: true, isActive: true } }
            }),
            prisma.purchaseOrder.count({
                where: { tenantId, ...locationFilter, status: { in: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] } }
            }),
            prisma.posSession.count({
                where: { tenantId, ...locationFilter, status: PosSessionStatus.OPEN }
            }),
        ];

        const results = await Promise.all(kpiPromises);

        const [
            salesDataCurrent, salesDataPrevious, refundDataCurrent, refundDataPrevious,
            inventoryValueResult, lowStockData, pendingPOData, openSessionData
        ] = results as [
            Prisma.GetOrderAggregateType<{ _sum: { totalAmount: true, discountAmount: true }, _count: { id: true } }>,
            Prisma.GetOrderAggregateType<{ _sum: { totalAmount: true }, _count: { id: true } }>,
            Prisma.GetPaymentAggregateType<{ _sum: { amount: true } }>,
            Prisma.GetPaymentAggregateType<{ _sum: { amount: true } }>,
            [{ total_value: number | null }],
            number, number, number
        ];

        const currentGrossSales = salesDataCurrent._sum.totalAmount ?? new Prisma.Decimal(0);
        const currentRefunds = refundDataCurrent._sum.amount ?? new Prisma.Decimal(0);
        const currentNetSales = currentGrossSales.minus(currentRefunds);
        const currentTransactions = salesDataCurrent._count.id ?? 0;

        const previousGrossSales = salesDataPrevious._sum.totalAmount ?? new Prisma.Decimal(0);
        const previousRefunds = refundDataPrevious._sum.amount ?? new Prisma.Decimal(0);
        const previousNetSales = previousGrossSales.minus(previousRefunds);
        const previousTransactions = salesDataPrevious._count.id ?? 0;

        const currentInventoryValue = new Prisma.Decimal(inventoryValueResult[0]?.total_value ?? 0);

        const kpis: DashboardKpiData = {
            netSales: {
                current: currentNetSales.toFixed(2),
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

const getSalesSummary = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId' | 'userId'>): Promise<SalesSummary> => {
    const logContext: LogContext = { function: 'getSalesSummary', tenantId, params };
    const startTime = Date.now();

    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    logContext.dateRange = { start: start.toISOString(), end: end.toISOString() };

    const whereFilter: Prisma.OrderWhereInput = {
        tenantId,
        status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
        createdAt: { gte: start, lte: end }
    };
    if (params.locationId) whereFilter.locationId = params.locationId;
    if (params.userId) whereFilter.userId = params.userId;

    try {
        const aggregateResult = await prisma.order.aggregate({
            _sum: { totalAmount: true, discountAmount: true, taxAmount: true, shippingCost: true, subtotal: true },
            _count: { id: true },
            where: whereFilter,
        });

        const refundResult = await prisma.payment.aggregate({
            _sum: { amount: true },
            where: {
                tenantId,
                returnId: { not: null },
                status: PaymentStatus.COMPLETED,
                createdAt: { gte: start, lte: end },
            }
        });

        const grossSales = aggregateResult._sum.totalAmount ?? new Prisma.Decimal(0);
        const totalOrders = aggregateResult._count.id ?? 0;
        const totalDiscounts = aggregateResult._sum.discountAmount ?? new Prisma.Decimal(0);
        const totalTax = aggregateResult._sum.taxAmount ?? new Prisma.Decimal(0);
        const totalShipping = aggregateResult._sum.shippingCost ?? new Prisma.Decimal(0);
        const totalReturns = refundResult._sum.amount ?? new Prisma.Decimal(0);
        const netSales = grossSales.minus(totalReturns);

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

const getInventoryOnHand = async (tenantId: string, params: Pick<ReportQueryDto, 'locationId' | 'productId' | 'categoryId'>): Promise<InventoryOnHandItem[]> => {
    const logContext: LogContext = { function: 'getInventoryOnHand', tenantId, params };
    const startTime = Date.now();

    const whereFilter: Prisma.InventoryItemWhereInput = { tenantId };
    if (params.locationId) whereFilter.locationId = params.locationId;
    if (params.productId) whereFilter.productId = params.productId;

    let productFilter: Prisma.ProductWhereInput = {};
    let hasProductFilter = false;

    if (params.categoryId) {
        productFilter.categories = {
            some: {
                categoryId: params.categoryId
            }
        };
        hasProductFilter = true;
    }

    if (hasProductFilter) {
        whereFilter.product = productFilter;
    }

    try {
        const items = await prisma.inventoryItem.findMany({
            where: whereFilter,
            select: {
                productId: true, locationId: true, quantityOnHand: true, quantityAllocated: true,
                averageCost: true,
                product: { select: { sku: true, name: true } },
                location: { select: { name: true } },
            },
            orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }]
        });

        const reportItems: InventoryOnHandItem[] = items.map(item => {
            const quantityOnHand = item.quantityOnHand;
            const quantityAllocated = item.quantityAllocated;
            const quantityAvailable = quantityOnHand.minus(quantityAllocated);
            const unitCost = item.averageCost;
            const totalValue = unitCost ? quantityOnHand.times(unitCost) : null;

            return {
                productId: item.productId,
                sku: item.product.sku,
                productName: item.product.name,
                locationId: item.locationId,
                locationName: item.location.name,
                quantityOnHand: quantityOnHand.toFixed(4),
                quantityAllocated: quantityAllocated.toFixed(4),
                quantityAvailable: quantityAvailable.toFixed(4),
                unitCost: unitCost?.toFixed(4) ?? null,
                totalValue: totalValue?.toFixed(2) ?? null,
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

export const reportingService = {
    getDashboardKpis,
    getSalesSummary,
    getInventoryOnHand,
    getSalesByProduct,
    getSalesByCategory,
    getSalesByLocation,
    getSalesByStaff,
    getPaymentMethodsSummary,
    getTaxSummary,
    getInventoryValuation,
    getLowStock,
    getInventoryMovementLedger,
    getInventoryAdjustmentReport,
    getInventoryTransferReport,
    getPurchaseOrderSummary,
    getPurchaseOrderDetailReport,
    getCustomerPurchaseHistory,
    getTopCustomers,
    getPosSessionReport,
    getSalesChartData
};