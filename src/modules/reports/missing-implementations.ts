// Missing report implementations - add to reports.service.ts exports

import { Prisma } from '@prisma/client';
import { prisma } from '@/config';
import { ReportQueryDto } from './dto/report-query.dto';
import { SalesByCategoryItem, SalesByLocationItem, PaymentMethodsSummaryItem } from './reporting.types';

// 1. Sales By Category
export const getSalesByCategory = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId'>): Promise<SalesByCategoryItem[]> => {
    const { start, end } = getDateRangeFromParams(params);

    const items = await prisma.orderItem.findMany({
        where: {
            tenantId,
            order: {
                status: { in: ['COMPLETED', 'SHIPPED'] },
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

    return Array.from(categoryMap.values()).map((cat) => ({
        categoryId: cat.id,
        categoryName: cat.name,
        quantitySold: cat.quantity.toFixed(2),
        grossSales: cat.grossSales.toFixed(2),
        netSales: cat.grossSales.toFixed(2),
    }));
};

// 2. Sales By Location
export const getSalesByLocation = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate'>): Promise<SalesByLocationItem[]> => {
    const { start, end } = getDateRangeFromParams(params);

    const orders = await prisma.order.groupBy({
        by: ['locationId'],
        _sum: { totalAmount: true },
        _count: { id: true },
        where: {
            tenantId,
            status: { in: ['COMPLETED', 'SHIPPED'] },
            createdAt: { gte: start, lte: end },
        },
    });

    const locationIds = orders.map((o) => o.locationId).filter((id) => id !== null) as string[];
    const locations = await prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true },
    });

    const locationMap = new Map(locations.map((l) => [l.id, l.name]));

    return orders.map((order) => ({
        locationId: order.locationId ?? 'UNKNOWN',
        locationName: locationMap.get(order.locationId!) ?? 'Unknown',
        totalOrders: order._count.id,
        grossSales: (order._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
        netSales: (order._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
    }));
};

// 3. Payment Methods Summary
export const getPaymentMethodsSummary = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate'>): Promise<PaymentMethodsSummaryItem[]> => {
    const { start, end } = getDateRangeFromParams(params);

    const payments = await prisma.payment.groupBy({
        by: ['paymentMethod'],
        _sum: { amount: true },
        _count: { id: true },
        where: {
            tenantId,
            status: 'COMPLETED',
            createdAt: { gte: start, lte: end },
            returnId: null,
        },
    });

    const refunds = await prisma.payment.groupBy({
        by: ['paymentMethod'],
        _sum: { amount: true },
        where: {
            tenantId,
            status: 'COMPLETED',
            createdAt: { gte: start, lte: end },
            returnId: { not: null },
        },
    });

    const refundMap = new Map(refunds.map((r) => [r.paymentMethod, r._sum.amount ?? new Prisma.Decimal(0)]));

    return payments.map((payment) => {
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
};

// Helper
function getDateRangeFromParams(params: Pick<ReportQueryDto, 'startDate' | 'endDate'>) {
    return {
        start: params.startDate ? new Date(params.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: params.endDate ? new Date(params.endDate) : new Date(),
    };
}
