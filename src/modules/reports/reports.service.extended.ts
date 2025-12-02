// src/modules/reports/reports.service.extended.ts
// Additional report service implementations

import httpStatus from 'http-status';
import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { ReportQueryDto } from './dto/report-query.dto';
import { getDateRange } from '@/utils/date.utils';
import { SalesByProductItem, InventoryValuationItem, LowStockItem } from './reporting.types';

type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; params?: any; error?: any;[key: string]: any; };

export const getSalesByCategory = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId'>): Promise<any[]> => {
    const logContext: LogContext = { function: 'getSalesByCategory', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const items = await prisma.orderItem.findMany({
            where: {
                tenantId,
                order: {
                    status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
                    createdAt: { gte: start, lte: end },
                    ...(params.locationId ? { locationId: params.locationId } : {}),
                },
            },
            include: {
                product: {
                    include: { categories: { include: { category: true } } },
                },
            },
        });

        const categoryMap = new Map<string, { id: string; name: string; quantity: Prisma.Decimal; grossSales: Prisma.Decimal }>();

        items.forEach((item) => {
            item.product.categories.forEach((pc) => {
                const categoryId = pc.category.id;
                const categoryName = pc.category.name;
                const existing = categoryMap.get(categoryId) || {
                    id: categoryId,
                    name: categoryName,
                    quantity: new Prisma.Decimal(0),
                    grossSales: new Prisma.Decimal(0),
                };
                existing.quantity = existing.quantity.plus(item.quantity);
                existing.grossSales = existing.grossSales.plus(item.lineTotal ?? 0);
                categoryMap.set(categoryId, existing);
            });
        });

        const reportItems = Array.from(categoryMap.values()).map((cat) => ({
            categoryId: cat.id,
            categoryName: cat.name,
            quantitySold: cat.quantity.toFixed(2),
            grossSales: cat.grossSales.toFixed(2),
            netSales: cat.grossSales.toFixed(2),
        }));

        logger.info(`Sales by category fetched successfully. Categories: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching sales by category`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sales by category.');
    }
};

export const getSalesByLocation = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate'>): Promise<any[]> => {
    const logContext: LogContext = { function: 'getSalesByLocation', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const orders = await prisma.order.groupBy({
            by: ['locationId'],
            _sum: { totalAmount: true },
            _count: { id: true },
            where: {
                tenantId,
                status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
                createdAt: { gte: start, lte: end },
            },
        });

        const locationIds = orders.map((o) => o.locationId).filter((id) => id !== null) as string[];
        const locations = await prisma.location.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, name: true },
        });

        const locationMap = new Map(locations.map((l) => [l.id, l.name]));

        const reportItems = orders.map((order) => ({
            locationId: order.locationId ?? 'UNKNOWN',
            locationName: locationMap.get(order.locationId!) ?? 'Unknown Location',
            totalOrders: order._count.id,
            grossSales: (order._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
            netSales: (order._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
        }));

        logger.info(`Sales by location fetched successfully. Locations: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching sales by location`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sales by location.');
    }
};

export const getPaymentMethodsSummary = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate'>): Promise<any[]> => {
    const logContext: LogContext = { function: 'getPaymentMethodsSummary', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const payments = await prisma.payment.groupBy({
            by: ['paymentMethod'],
            _sum: { amount: true },
            _count: { id: true },
            where: {
                tenantId,
                status: PaymentStatus.COMPLETED,
                createdAt: { gte: start, lte: end },
                returnId: null,
            },
        });

        const refunds = await prisma.payment.groupBy({
            by: ['paymentMethod'],
            _sum: { amount: true },
            where: {
                tenantId,
                status: PaymentStatus.COMPLETED,
                createdAt: { gte: start, lte: end },
                returnId: { not: null },
            },
        });

        const refundMap = new Map(refunds.map((r) => [r.paymentMethod, r._sum.amount ?? new Prisma.Decimal(0)]));

        const reportItems = payments.map((payment) => {
            const totalAmount = payment._sum.amount ?? new Prisma.Decimal(0);
            const refundAmount = refundMap.get(payment.paymentMethod) ?? new Prisma.Decimal(0);
            const netAmount = totalAmount.minus(refundAmount);

            return {
                paymentMethod: payment.paymentMethod,
                totalAmount: totalAmount.toFixed(2),
                transactionCount: payment._count.id,
                refundAmount: refundAmount.toFixed(2),
                netAmount: netAmount.toFixed(2),
            };
        });

        logger.info(`Payment methods summary fetched successfully. Methods: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching payment methods summary`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve payment methods summary.');
    }
};

export const getSalesByProduct = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId' | 'productId'>): Promise<SalesByProductItem[]> => {
    const logContext: LogContext = { function: 'getSalesByProduct', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    const orderFilter: Prisma.OrderWhereInput = {
        status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
        createdAt: { gte: start, lte: end },
    };
    if (params.locationId) orderFilter.locationId = params.locationId;

    const whereFilter: Prisma.OrderItemWhereInput = {
        tenantId,
        order: orderFilter,
    };
    if (params.productId) whereFilter.productId = params.productId;

    try {
        const items = await prisma.orderItem.groupBy({
            by: ['productId'],
            _sum: { quantity: true, lineTotal: true, discountAmount: true },
            where: whereFilter,
        });

        const productIds = items.map((item) => item.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, sku: true, name: true },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));

        const reportItems: SalesByProductItem[] = items.map((item) => {
            const product = productMap.get(item.productId);
            const grossSales = item._sum.lineTotal ?? new Prisma.Decimal(0);
            const totalDiscounts = item._sum.discountAmount ?? new Prisma.Decimal(0);
            const netSales = grossSales.minus(totalDiscounts);

            return {
                productId: item.productId,
                sku: product?.sku ?? 'UNKNOWN',
                productName: product?.name ?? 'Unknown Product',
                quantitySold: (item._sum.quantity ?? new Prisma.Decimal(0)).toFixed(2),
                grossSales: grossSales.toFixed(2),
                totalDiscounts: totalDiscounts.toFixed(2),
                netSales: netSales.toFixed(2),
            };
        });

        logger.info(`Sales by product fetched successfully. Products: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching sales by product`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sales by product.');
    }
};

export const getInventoryValuation = async (tenantId: string, params: Pick<ReportQueryDto, 'locationId'>): Promise<InventoryValuationItem[]> => {
    const logContext: LogContext = { function: 'getInventoryValuation', tenantId, params };

    try {
        const whereFilter: Prisma.InventoryItemWhereInput = { tenantId };
        if (params.locationId) whereFilter.locationId = params.locationId;

        const items = await prisma.inventoryItem.findMany({
            where: whereFilter,
            select: {
                productId: true,
                locationId: true,
                quantityOnHand: true,
                quantityAllocated: true,
                averageCost: true,
                product: { select: { sku: true, name: true } },
                location: { select: { name: true } },
            },
            orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }],
        });

        const reportItems: InventoryValuationItem[] = items.map((item) => {
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
                valuationMethod: 'AVERAGE_COST',
            };
        });

        logger.info(`Inventory valuation fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching inventory valuation`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve inventory valuation.');
    }
};

export const getLowStock = async (tenantId: string, params: Pick<ReportQueryDto, 'locationId'>): Promise<LowStockItem[]> => {
    const logContext: LogContext = { function: 'getLowStock', tenantId, params };

    try {
        const whereFilter: Prisma.InventoryItemWhereInput = {
            tenantId,
            product: { isStockTracked: true, isActive: true },
        };
        if (params.locationId) whereFilter.locationId = params.locationId;

        const items = await prisma.inventoryItem.findMany({
            where: whereFilter,
            select: {
                productId: true,
                locationId: true,
                quantityOnHand: true,
                quantityAllocated: true,
                reorderPoint: true,
                quantityIncoming: true,
                product: { select: { sku: true, name: true } },
                location: { select: { name: true } },
            },
        });

        const lowStockItems: LowStockItem[] = items
            .filter((item) => {
                const available = item.quantityOnHand.minus(item.quantityAllocated);
                return item.reorderPoint && available.lessThanOrEqualTo(item.reorderPoint);
            })
            .map((item) => {
                const quantityOnHand = item.quantityOnHand;
                const quantityAllocated = item.quantityAllocated;
                const quantityAvailable = quantityOnHand.minus(quantityAllocated);
                const reorderPoint = item.reorderPoint;
                const quantityBelowReorder = reorderPoint ? reorderPoint.minus(quantityAvailable) : null;

                return {
                    productId: item.productId,
                    sku: item.product.sku,
                    productName: item.product.name,
                    locationId: item.locationId,
                    locationName: item.location.name,
                    quantityOnHand: quantityOnHand.toFixed(4),
                    quantityAvailable: quantityAvailable.toFixed(4),
                    reorderPoint: reorderPoint?.toFixed(4) ?? null,
                    quantityBelowReorder: quantityBelowReorder?.toFixed(4) ?? null,
                    quantityIncoming: item.quantityIncoming?.toFixed(4) ?? null,
                };
            });

        logger.info(`Low stock report fetched successfully. Items: ${lowStockItems.length}`, logContext);
        return lowStockItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching low stock report`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve low stock report.');
    }
};
