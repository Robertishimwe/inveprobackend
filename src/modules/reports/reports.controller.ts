// src/modules/reports/reports.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { reportingService } from './reports.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';


// --- DTO Definition ---
export class ReportQueryDto {
     startDate?: string;
     endDate?: string;
     locationId?: string;
     productId?: string;
     categoryId?: string;
     customerId?: string;
     userId?: string;
     page?: number;
     limit?: number;
     sortBy?: string;
     period?: string;
     supplierId?: string;
     status?: string;
     poNumber?: string;
     orderNumber?: string;
     returnNumber?: string;
     quantityLte?: string;
     quantityGte?: string;
     search?: string;
}

// Helper function to parse and validate common report query parameters
const parseAndValidateReportQuery = (req: Request): ReportQueryDto => {
     const query = pick(req.query, [
          'startDate', 'endDate', 'locationId', 'productId', 'categoryId',
          'customerId', 'userId', 'page', 'limit', 'sortBy', 'period',
          'supplierId', 'status', 'poNumber', 'orderNumber', 'returnNumber',
          'quantityLte', 'quantityGte', 'search'
     ]);

     const pageParam = query.page ? parseInt(query.page as string, 10) : 1;
     const limitParam = query.limit ? parseInt(query.limit as string, 10) : 50;

     const parsed: ReportQueryDto = {
          startDate: query.startDate as string | undefined,
          endDate: query.endDate as string | undefined,
          locationId: query.locationId as string | undefined,
          productId: query.productId as string | undefined,
          categoryId: query.categoryId as string | undefined,
          customerId: query.customerId as string | undefined,
          userId: query.userId as string | undefined,
          sortBy: query.sortBy as string | undefined,
          period: query.period as string | undefined ?? 'today',
          supplierId: query.supplierId as string | undefined,
          status: query.status as string | undefined,
          poNumber: query.poNumber as string | undefined,
          orderNumber: query.orderNumber as string | undefined,
          returnNumber: query.returnNumber as string | undefined,
          quantityLte: query.quantityLte as string | undefined,
          quantityGte: query.quantityGte as string | undefined,
          search: query.search as string | undefined,
          page: !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1,
          limit: !isNaN(limitParam) && limitParam >= 1 && limitParam <= 1000 ? limitParam : 50,
     };

     return parsed;
};

// --- Controller Methods ---

const getDashboardKpis = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = pick(req.query, ['period', 'locationId']) as Pick<ReportQueryDto, 'period' | 'locationId'>;
     const kpiData = await reportingService.getDashboardKpis(tenantId, queryParams);
     res.status(httpStatus.OK).send(kpiData);
});

const getSalesSummary = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const summaryData = await reportingService.getSalesSummary(tenantId, {
          startDate: queryParams.startDate,
          endDate: queryParams.endDate,
          locationId: queryParams.locationId,
          userId: queryParams.userId,
     });
     res.status(httpStatus.OK).send(summaryData);
});

const getSalesByProduct = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getSalesByProduct(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getSalesByCategory = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getSalesByCategory(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getSalesByLocation = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getSalesByLocation(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getSalesByStaff = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getSalesByStaff(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getPaymentMethodsSummary = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getPaymentMethodsSummary(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getTaxSummary = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getTaxSummary(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getInventoryOnHand = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const inventoryData = await reportingService.getInventoryOnHand(tenantId, {
          locationId: queryParams.locationId,
          productId: queryParams.productId,
          categoryId: queryParams.categoryId,
          search: queryParams.search,
          page: queryParams.page,
          limit: queryParams.limit,
     });
     res.status(httpStatus.OK).send(inventoryData);
});

const getInventoryValuation = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getInventoryValuation(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getLowStock = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getLowStock(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getInventoryMovementLedger = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getInventoryMovementLedger(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getInventoryAdjustmentReport = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getInventoryAdjustmentReport(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getInventoryTransferReport = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getInventoryTransferReport(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getPurchaseOrderSummary = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getPurchaseOrderSummary(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getPurchaseOrderDetailReport = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getPurchaseOrderDetailReport(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getCustomerPurchaseHistory = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     if (!queryParams.customerId) throw new ApiError(httpStatus.BAD_REQUEST, 'customerId query parameter is required.');
     const data = await reportingService.getCustomerPurchaseHistory(tenantId, queryParams.customerId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getTopCustomers = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getTopCustomers(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getPosSessionReport = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getPosSessionReport(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

const getSalesChartData = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await reportingService.getSalesChartData(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

export const reportingController = {
     getDashboardKpis,
     getSalesSummary,
     getSalesByProduct,
     getSalesByCategory,
     getSalesByLocation,
     getSalesByStaff,
     getPaymentMethodsSummary,
     getTaxSummary,
     getInventoryOnHand,
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

