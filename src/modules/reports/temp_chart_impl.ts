
export const getSalesChartData = async (tenantId: string, params: Pick<ReportQueryDto, 'startDate' | 'endDate' | 'locationId' | 'period'>): Promise<any[]> => {
    const logContext: LogContext = { function: 'getSalesChartData', tenantId, params };
    // Use custom range if provided, otherwise fallback to period (defaulting to last 30 days if handled by helper)
    // Actually getDateRange handles period string or custom dates.
    // If period is not provided, we might default to 'last_30_days' or trust startDate/endDate

    // Logic: if startDate/endDate exist, use them. Else use period which defaults to 'today'. 
    // Ideally for a chart default we want 'last_30_days'.

    const period = params.startDate ? 'custom' : (params.period || 'last_30_days');
    const { currentRange } = getDateRange(period, params.startDate, params.endDate);
    const { start, end } = currentRange;

    try {
        // Group by day using raw query for date truncation (Prisma groupBy doesn't support date truncation easily without raw or extra column)
        // OR fetch all orders and aggregate in JS (easier for compatibility, acceptable for moderate data size)

        // Let's use fetch and aggregate for safety and DB provider independence (if not solely Postgres)
        // Check order volume assumption. Assuming fetching summary data (date, total) is fine.

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

        // Initialize map with all days in range to ensure 0-value days exist
        // (Simplified: just aggregated found days first, handling gaps in frontend or improved logic here)
        // Better: Iterate from start to end day-by-day.

        const currentDate = new Date(start);
        while (currentDate <= end) {
            const dateKey = currentDate.toISOString().split('T')[0];
            dailyMap.set(dateKey, 0);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        orders.forEach(order => {
            const dateKey = order.createdAt.toISOString().split('T')[0];
            const currentTotal = dailyMap.get(dateKey) || 0;
            // totalAmount is Decimal
            dailyMap.set(dateKey, currentTotal + (order.totalAmount ? Number(order.totalAmount) : 0));
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
