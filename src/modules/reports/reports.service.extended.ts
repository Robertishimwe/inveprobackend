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

export const getInventoryValuation = async (tenantId: string, params: Pick<ReportQueryDto, 'locationId' | 'search' | 'page' | 'limit'>): Promise<{
    results: InventoryValuationItem[];
    totalResults: number;
    page: number;
    limit: number;
}> => {
    const logContext: LogContext = { function: 'getInventoryValuation', tenantId, params };

    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    try {
        const whereFilter: Prisma.InventoryItemWhereInput = { tenantId };
        if (params.locationId) whereFilter.locationId = params.locationId;

        // Add search filter (product name or SKU)
        if (params.search) {
            const searchTerm = params.search.trim();
            whereFilter.product = {
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { sku: { contains: searchTerm, mode: 'insensitive' } }
                ]
            };
        }

        // Get total count for pagination
        const totalResults = await prisma.inventoryItem.count({ where: whereFilter });

        const items = await prisma.inventoryItem.findMany({
            where: whereFilter,
            select: {
                productId: true,
                locationId: true,
                quantityOnHand: true,
                quantityAllocated: true,
                averageCost: true,
                product: { select: { sku: true, name: true, unitOfMeasure: true, costPrice: true } },
                location: { select: { name: true } },
            },
            orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }],
            skip,
            take: limit
        });

        const reportItems: InventoryValuationItem[] = items.map((item) => {
            const quantityOnHand = item.quantityOnHand;
            const quantityAllocated = item.quantityAllocated;
            const quantityAvailable = quantityOnHand.minus(quantityAllocated);
            // Fallback to product.costPrice if averageCost is not set
            const unitCost = item.averageCost ?? item.product.costPrice;
            const totalValue = unitCost ? quantityOnHand.times(unitCost) : null;

            return {
                productId: item.productId,
                sku: item.product.sku,
                productName: item.product.name,
                unitOfMeasure: item.product.unitOfMeasure ?? 'each',
                locationId: item.locationId,
                locationName: item.location.name,
                quantityOnHand: quantityOnHand.toNumber(),
                quantityAllocated: quantityAllocated.toNumber(),
                quantityAvailable: quantityAvailable.toNumber(),
                unitCost: unitCost?.toNumber() ?? null,
                totalValue: totalValue?.toNumber() ?? null,
                valuationMethod: 'AVERAGE_COST',
            };
        });

        logger.info(`Inventory valuation fetched successfully. Items: ${reportItems.length}. Total: ${totalResults}`, logContext);
        return {
            results: reportItems,
            totalResults,
            page,
            limit
        };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching inventory valuation`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve inventory valuation.');
    }
};

export const getLowStock = async (tenantId: string, params: Pick<ReportQueryDto, 'locationId' | 'search' | 'page' | 'limit'>): Promise<{
    results: LowStockItem[];
    totalResults: number;
    page: number;
    limit: number;
}> => {
    const logContext: LogContext = { function: 'getLowStock', tenantId, params };

    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    try {
        const whereFilter: Prisma.InventoryItemWhereInput = {
            tenantId,
            product: { isStockTracked: true, isActive: true },
            // Only include items that HAVE a reorder point set
            reorderPoint: { not: null },
        };
        if (params.locationId) whereFilter.locationId = params.locationId;

        // Add search filter
        if (params.search) {
            const searchTerm = params.search.trim();
            whereFilter.product = {
                isStockTracked: true,
                isActive: true,
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { sku: { contains: searchTerm, mode: 'insensitive' } }
                ]
            };
        }

        const items = await prisma.inventoryItem.findMany({
            where: whereFilter,
            select: {
                productId: true,
                locationId: true,
                quantityOnHand: true,
                quantityAllocated: true,
                reorderPoint: true,
                quantityIncoming: true,
                product: { select: { sku: true, name: true, unitOfMeasure: true } },
                location: { select: { name: true } },
            },
            orderBy: [
                // Order by most critical first (lowest available relative to reorder point)
                { quantityOnHand: 'asc' }
            ],
            skip,
            take: limit,
        });

        // Filter to only items that are actually below or at reorder point
        const lowStockItems: LowStockItem[] = items
            .filter((item) => {
                const available = item.quantityOnHand.minus(item.quantityAllocated);
                return item.reorderPoint && available.lessThanOrEqualTo(item.reorderPoint);
            })
            .map((item) => {
                const quantityOnHand = item.quantityOnHand;
                const quantityAllocated = item.quantityAllocated;
                const quantityAvailable = quantityOnHand.minus(quantityAllocated);
                const reorderPoint = item.reorderPoint!;
                const quantityBelowReorder = reorderPoint.minus(quantityAvailable);

                return {
                    productId: item.productId,
                    sku: item.product.sku,
                    productName: item.product.name,
                    unitOfMeasure: item.product.unitOfMeasure ?? 'each',
                    locationId: item.locationId,
                    locationName: item.location.name,
                    quantityOnHand: quantityOnHand.toNumber(),
                    quantityAvailable: quantityAvailable.toNumber(),
                    reorderPoint: reorderPoint.toNumber(),
                    quantityBelowReorder: quantityBelowReorder.toNumber(),
                    quantityIncoming: item.quantityIncoming?.toNumber() ?? null,
                };
            });

        logger.info(`Low stock report fetched successfully. Items: ${lowStockItems.length}`, logContext);
        return {
            results: lowStockItems,
            totalResults: lowStockItems.length, // Use actual filtered count
            page,
            limit
        };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching low stock report`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve low stock report.');
    }
};



export const getInventoryMovementLedger = async (tenantId: string, params: ReportQueryDto): Promise<any[]> => {
    const logContext: LogContext = { function: 'getInventoryMovementLedger', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const whereFilter: Prisma.InventoryTransactionWhereInput = {
            tenantId,
            timestamp: { gte: start, lte: end },
        };
        if (params.locationId) whereFilter.locationId = params.locationId;
        if (params.productId) whereFilter.productId = params.productId;

        const transactions = await prisma.inventoryTransaction.findMany({
            where: whereFilter,
            include: {
                product: { select: { sku: true, name: true } },
                location: { select: { name: true } },
                user: { select: { firstName: true, lastName: true } },
            },
            orderBy: { timestamp: 'desc' },
            take: params.limit || 100,
            skip: ((params.page || 1) - 1) * (params.limit || 100),
        });

        const reportItems = transactions.map((tx) => ({
            transactionId: tx.id.toString(),
            timestamp: tx.timestamp.toISOString(),
            productId: tx.productId,
            sku: tx.product.sku,
            productName: tx.product.name,
            locationId: tx.locationId,
            locationName: tx.location.name,
            transactionType: tx.transactionType,
            quantityChange: tx.quantityChange.toFixed(4),
            unitCost: tx.unitCost?.toFixed(2) ?? null,
            userId: tx.userId,
            userName: tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() : 'System',
            relatedDocumentType: tx.relatedOrderId ? 'Order' : tx.relatedPoId ? 'PO' : tx.relatedTransferId ? 'Transfer' : tx.relatedAdjustmentId ? 'Adjustment' : null,
            relatedDocumentId: tx.relatedOrderId || tx.relatedPoId || tx.relatedTransferId || tx.relatedAdjustmentId,
            notes: tx.notes,
        }));

        logger.info(`Inventory movement ledger fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching inventory movement ledger`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve inventory movement ledger.');
    }
};

export const getInventoryAdjustmentReport = async (tenantId: string, params: ReportQueryDto): Promise<any[]> => {
    const logContext: LogContext = { function: 'getInventoryAdjustmentReport', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const whereFilter: Prisma.InventoryAdjustmentWhereInput = {
            tenantId,
            adjustmentDate: { gte: start, lte: end },
        };
        if (params.locationId) whereFilter.locationId = params.locationId;

        const adjustments = await prisma.inventoryAdjustment.findMany({
            where: whereFilter,
            include: {
                location: { select: { name: true } },
                createdByUser: { select: { firstName: true, lastName: true } },
                items: true,
            },
            orderBy: { adjustmentDate: 'desc' },
        });

        const reportItems = adjustments.map((adj) => ({
            adjustmentId: adj.id,
            adjustmentDate: adj.adjustmentDate.toISOString(),
            locationId: adj.locationId,
            locationName: adj.location.name,
            reasonCode: adj.reasonCode,
            notes: adj.notes,
            itemCount: adj.items.length,
            createdByUserId: adj.createdByUserId,
            createdByUserName: adj.createdByUser ? `${adj.createdByUser.firstName || ''} ${adj.createdByUser.lastName || ''}`.trim() : 'Unknown',
        }));

        logger.info(`Inventory adjustment report fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching inventory adjustment report`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve inventory adjustment report.');
    }
};

export const getInventoryTransferReport = async (tenantId: string, params: ReportQueryDto): Promise<any[]> => {
    const logContext: LogContext = { function: 'getInventoryTransferReport', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const whereFilter: Prisma.InventoryTransferWhereInput = {
            tenantId,
            transferDate: { gte: start, lte: end },
        };
        if (params.locationId) {
            whereFilter.OR = [
                { sourceLocationId: params.locationId },
                { destinationLocationId: params.locationId },
            ];
        }

        const transfers = await prisma.inventoryTransfer.findMany({
            where: whereFilter,
            include: {
                sourceLocation: { select: { name: true } },
                destinationLocation: { select: { name: true } },
                createdByUser: { select: { firstName: true, lastName: true } },
                items: true,
            },
            orderBy: { transferDate: 'desc' },
        });

        const reportItems = transfers.map((transfer) => ({
            transferId: transfer.id,
            transferDate: transfer.transferDate.toISOString(),
            status: transfer.status,
            sourceLocationId: transfer.sourceLocationId,
            sourceLocationName: transfer.sourceLocation.name,
            destinationLocationId: transfer.destinationLocationId,
            destinationLocationName: transfer.destinationLocation.name,
            itemCount: transfer.items.length,
            createdByUserId: transfer.createdByUserId,
            createdByUserName: transfer.createdByUser ? `${transfer.createdByUser.firstName || ''} ${transfer.createdByUser.lastName || ''}`.trim() : 'Unknown',
        }));

        logger.info(`Inventory transfer report fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching inventory transfer report`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve inventory transfer report.');
    }
};

export const getPurchaseOrderSummary = async (tenantId: string, params: ReportQueryDto): Promise<any[]> => {
    const logContext: LogContext = { function: 'getPurchaseOrderSummary', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const whereFilter: Prisma.PurchaseOrderWhereInput = {
            tenantId,
            orderDate: { gte: start, lte: end },
        };
        if (params.locationId) whereFilter.locationId = params.locationId;
        if (params.supplierId) whereFilter.supplierId = params.supplierId;
        if (params.status) whereFilter.status = params.status as any;

        const pos = await prisma.purchaseOrder.findMany({
            where: whereFilter,
            include: {
                supplier: { select: { name: true } },
                location: { select: { name: true } },
                items: true,
            },
            orderBy: { orderDate: 'desc' },
        });

        const reportItems = pos.map((po) => ({
            poId: po.id,
            poNumber: po.poNumber,
            orderDate: po.orderDate.toISOString(),
            expectedDeliveryDate: po.expectedDeliveryDate?.toISOString(),
            supplierId: po.supplierId,
            supplierName: po.supplier.name,
            locationId: po.locationId,
            locationName: po.location.name,
            status: po.status,
            itemCount: po.items.length,
            totalAmount: po.totalAmount.toFixed(2),
            isOverdue: po.expectedDeliveryDate ? new Date() > po.expectedDeliveryDate && po.status !== 'FULLY_RECEIVED' && po.status !== 'CLOSED' && po.status !== 'CANCELLED' : false,
        }));

        logger.info(`Purchase order summary fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching purchase order summary`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve purchase order summary.');
    }
};

export const getPurchaseOrderDetailReport = async (tenantId: string, params: ReportQueryDto): Promise<any[]> => {
    return getPurchaseOrderSummary(tenantId, params);
};

export const getCustomerPurchaseHistory = async (tenantId: string, customerId: string, params: ReportQueryDto): Promise<any[]> => {
    const logContext: LogContext = { function: 'getCustomerPurchaseHistory', tenantId, customerId, params };

    try {
        const orders = await prisma.order.findMany({
            where: {
                tenantId,
                customerId,
            },
            include: {
                items: true,
            },
            orderBy: { orderDate: 'desc' },
            take: params.limit || 50,
        });

        const reportItems = orders.map((order) => ({
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderDate: order.orderDate.toISOString(),
            totalAmount: order.totalAmount.toFixed(2),
            status: order.status,
            itemCount: order.items.length,
        }));

        logger.info(`Customer purchase history fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching customer purchase history`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve customer purchase history.');
    }
};

export const getTopCustomers = async (tenantId: string, params: ReportQueryDto): Promise<any[]> => {
    const logContext: LogContext = { function: 'getTopCustomers', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const customers = await prisma.order.groupBy({
            by: ['customerId'],
            _sum: { totalAmount: true },
            _count: { id: true },
            where: {
                tenantId,
                status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
                createdAt: { gte: start, lte: end },
                customerId: { not: null },
            },
            orderBy: { _sum: { totalAmount: 'desc' } },
            take: params.limit || 20,
        });

        const customerIds = customers.map((c) => c.customerId) as string[];
        const customerDetails = await prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, firstName: true, lastName: true, companyName: true, email: true },
        });

        const customerMap = new Map(customerDetails.map((c) => [c.id, c]));

        const reportItems = customers.map((c) => {
            const details = customerMap.get(c.customerId!);
            const name = details?.companyName || `${details?.firstName || ''} ${details?.lastName || ''}`.trim() || 'Unknown Customer';

            return {
                customerId: c.customerId!,
                customerName: name,
                email: details?.email,
                totalSpent: (c._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
                orderCount: c._count.id,
            };
        });

        logger.info(`Top customers fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching top customers`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve top customers.');
    }
};

export const getPosSessionReport = async (tenantId: string, params: ReportQueryDto): Promise<any[]> => {
    const logContext: LogContext = { function: 'getPosSessionReport', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const sessions = await prisma.posSession.findMany({
            where: {
                tenantId,
                startTime: { gte: start, lte: end },
                ...(params.locationId ? { locationId: params.locationId } : {}),
                ...(params.userId ? { userId: params.userId } : {}),
            },
            include: {
                location: { select: { name: true } },
                user: { select: { firstName: true, lastName: true } },
                transactions: true,
                // Note: orders relation doesn't exist on PosSession - skipping for now
            },
            orderBy: { startTime: 'desc' },
        }) as any[];

        const reportItems = sessions.map((session: any) => {
            // Build paymentSummary from transactions
            const paymentSummary: Record<string, number> = {};
            session.transactions.forEach((t: any) => {
                const type = t.transactionType;
                const amount = t.amount.toNumber();
                paymentSummary[type] = (paymentSummary[type] || 0) + amount;
            });

            // Sales by payment type from transactions
            const totalCashSales = session.transactions
                .filter((t: any) => t.transactionType === 'CASH_SALE')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalCardSales = session.transactions
                .filter((t: any) => t.transactionType === 'CARD_SALE')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalMobileMoneyPayments = session.transactions
                .filter((t: any) => t.transactionType === 'MOBILE_MONEY_SALE')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalCheckPayments = session.transactions
                .filter((t: any) => t.transactionType === 'CHECK_SALE')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalBankTransfer = session.transactions
                .filter((t: any) => t.transactionType === 'BANK_TRANSFER_SALE')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalOtherPayments = session.transactions
                .filter((t: any) => t.transactionType === 'OTHER_SALE')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalCashRefunds = session.transactions
                .filter((t: any) => t.transactionType === 'CASH_REFUND')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalPayIns = session.transactions
                .filter((t: any) => t.transactionType === 'PAY_IN')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            const totalPayOuts = session.transactions
                .filter((t: any) => t.transactionType === 'PAY_OUT')
                .reduce((sum: any, t: any) => sum.plus(t.amount), new Prisma.Decimal(0));

            // Cash drawer calculation
            const netCashChange = totalCashSales.plus(totalPayIns).minus(totalCashRefunds).minus(totalPayOuts);
            const expectedCash = session.startingCash.plus(netCashChange);

            // Calculate variance
            const actualCash = session.endingCash ?? null;
            const difference = session.difference ?? (actualCash ? new Prisma.Decimal(actualCash).minus(expectedCash) : null);
            const isBalanced = difference ? difference.equals(0) : null;

            // Order-based metrics
            const completedOrders = session.orders?.filter((o: any) =>
                o.status === OrderStatus.COMPLETED || o.status === OrderStatus.SHIPPED
            ) || [];

            const grossSalesInSession = completedOrders.reduce(
                (sum: any, o: any) => sum.plus(o.totalAmount || 0),
                new Prisma.Decimal(0)
            );

            const taxCollectedInSession = completedOrders.reduce(
                (sum: any, o: any) => sum.plus(o.taxAmount || 0),
                new Prisma.Decimal(0)
            );

            const discountsGivenInSession = completedOrders.reduce(
                (sum: any, o: any) => sum.plus(o.discountAmount || 0),
                new Prisma.Decimal(0)
            );

            // Net sales = Gross - Refunds
            const netSalesInSession = grossSalesInSession.minus(totalCashRefunds);

            // Transaction count and average
            const totalTransactions = completedOrders.length || session.transactions.length;
            const averageTransactionValue = totalTransactions > 0
                ? netSalesInSession.dividedBy(totalTransactions)
                : new Prisma.Decimal(0);

            return {
                sessionId: session.id,
                startTime: session.startTime.toISOString(),
                endTime: session.endTime?.toISOString() || null,
                locationId: session.locationId,
                locationName: session.location.name,
                terminalId: session.posTerminalId,
                userId: session.userId,
                userName: `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Unknown',
                status: session.status,
                notes: (session as any).notes || null,
                // Cash drawer
                startingCash: session.startingCash.toFixed(2),
                endingCash: session.endingCash?.toFixed(2) || null,
                calculatedCash: session.calculatedCash?.toFixed(2) ?? expectedCash.toFixed(2),
                expectedCashInDrawer: expectedCash.toFixed(2),
                difference: difference?.toFixed(2) || null,
                isBalanced,
                // Cash transactions
                totalCashSales: totalCashSales.toFixed(2),
                totalCashRefunds: totalCashRefunds.toFixed(2),
                totalPayIns: totalPayIns.toFixed(2),
                totalPayOuts: totalPayOuts.toFixed(2),
                netCashChange: netCashChange.toFixed(2),
                // Sales by payment method
                cardSalesTotal: totalCardSales.toFixed(2),
                mobileMoneyTotal: totalMobileMoneyPayments.toFixed(2),
                checkPaymentsTotal: totalCheckPayments.toFixed(2),
                bankTransferTotal: totalBankTransfer.toFixed(2),
                otherPaymentsTotal: totalOtherPayments.toFixed(2),
                // Payment summary (for detailed breakdown)
                paymentSummary,
                // Order metrics
                grossSalesInSession: grossSalesInSession.toFixed(2),
                netSalesInSession: netSalesInSession.toFixed(2),
                taxCollectedInSession: taxCollectedInSession.toFixed(2),
                discountsGivenInSession: discountsGivenInSession.toFixed(2),
                totalTransactions,
                averageTransactionValue: averageTransactionValue.toFixed(2),
            };
        });

        logger.info(`POS session report fetched successfully. Items: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching POS session report`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve POS session report.');
    }
};

export const getSalesByStaff = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId'>): Promise<any[]> => {
    const logContext: LogContext = { function: 'getSalesByStaff', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const orders = await prisma.order.groupBy({
            by: ['userId'],
            _sum: { totalAmount: true },
            _count: { id: true },
            where: {
                tenantId,
                status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
                createdAt: { gte: start, lte: end },
                ...(params.locationId ? { locationId: params.locationId } : {}),
            },
        });

        const userIds = orders.map((o) => o.userId).filter((id) => id !== null) as string[];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
        });

        const userMap = new Map(users.map((u) => [u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown User']));

        const reportItems = orders.map((order) => {
            const grossSales = order._sum.totalAmount ?? new Prisma.Decimal(0);
            const totalOrders = order._count.id;

            return {
                userId: order.userId ?? 'UNKNOWN',
                staffName: userMap.get(order.userId!) ?? 'Unknown Staff',
                totalOrders,
                grossSales: grossSales.toFixed(2),
                netSales: grossSales.toFixed(2), // Net sales calculation requires refund linking which is complex here
                averageOrderValue: totalOrders > 0 ? grossSales.dividedBy(totalOrders).toFixed(2) : "0.00",
            };
        });

        logger.info(`Sales by staff fetched successfully. Staff count: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching sales by staff`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sales by staff.');
    }
};

export const getTaxSummary = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId'>): Promise<any[]> => {
    const logContext: LogContext = { function: 'getTaxSummary', tenantId, params };
    const { currentRange } = getDateRange(params.startDate ? 'custom' : undefined, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        // Aggregate by tax rate from OrderItems
        const taxGroups = await prisma.orderItem.groupBy({
            by: ['taxRate'],
            _sum: { taxAmount: true, lineTotal: true },
            where: {
                tenantId,
                order: {
                    status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
                    createdAt: { gte: start, lte: end },
                    ...(params.locationId ? { locationId: params.locationId } : {}),
                },
            },
        });

        const reportItems = taxGroups.map((group) => ({
            taxRate: group.taxRate.mul(100).toFixed(2) + '%', // Convert decimal to percentage string
            taxableSales: (group._sum.lineTotal ?? new Prisma.Decimal(0)).toFixed(2),
            taxCollected: (group._sum.taxAmount ?? new Prisma.Decimal(0)).toFixed(2),
            reportingPeriod: { start: start.toISOString(), end: end.toISOString() },
        }));

        logger.info(`Tax summary fetched successfully. Groups: ${reportItems.length}`, logContext);
        return reportItems;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching tax summary`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve tax summary.');
    }
};

export const getSalesChartData = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId' | 'period'>): Promise<any[]> => {
    const logContext: LogContext = { function: 'getSalesChartData', tenantId, params };
    // Default to last 30 days if no specific range provided for the chart
    const period = params.startDate ? 'custom' : (params.period || 'last_30_days');
    const { currentRange } = getDateRange(period, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        const orders = await prisma.order.findMany({
            where: {
                tenantId,
                status: { in: [OrderStatus.COMPLETED, OrderStatus.SHIPPED] },
                createdAt: { gte: start, lte: end },
                ...(params.locationId ? { locationId: params.locationId } : {}),
            },
            select: {
                createdAt: true,
                totalAmount: true,
            },
            orderBy: { createdAt: 'asc' }
        });

        const dailyMap = new Map<string, number>();

        // Fill dates
        const currentDate = new Date(start);
        const endDateObj = new Date(end);

        let safetyCount = 0;
        while (currentDate <= endDateObj && safetyCount < 3660) {
            const dateKey = currentDate.toISOString().split('T')[0];
            dailyMap.set(dateKey, 0);
            currentDate.setDate(currentDate.getDate() + 1);
            safetyCount++;
        }

        orders.forEach(order => {
            const dateKey = order.createdAt.toISOString().split('T')[0];
            if (dailyMap.has(dateKey)) {
                const currentTotal = dailyMap.get(dateKey) || 0;
                dailyMap.set(dateKey, currentTotal + (order.totalAmount ? Number(order.totalAmount) : 0));
            } else {
                const currentTotal = dailyMap.get(dateKey) || 0;
                dailyMap.set(dateKey, currentTotal + (order.totalAmount ? Number(order.totalAmount) : 0));
            }
        });

        const chartData = Array.from(dailyMap.entries()).map(([date, amount]) => ({
            date,
            sales: Number(amount.toFixed(2))
        }));

        logger.info(`Sales chart data fetched successfully. Data points: ${chartData.length}`, logContext);
        return chartData;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching sales chart data`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sales chart data.');
    }
};
