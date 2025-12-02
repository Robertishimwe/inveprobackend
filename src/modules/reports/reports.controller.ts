// src/modules/reports/reports.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { reportingService } from './reports.service'; // Assuming reportingService has all needed methods
import * as extendedReportingService from './reports.service.extended'; // Extended implementations
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // Utility for filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
// import { Prisma, OrderStatus, PurchaseOrderStatus, PosSessionStatus } from '@prisma/client'; // Import Prisma types and enums
import logger from '@/utils/logger';

// --- FIX DTO Definition (Move to dto/report-query.dto.ts) ---
// Ensure ReportQueryDto includes all picked fields as optional
export class ReportQueryDto {
     startDate?: string;
     endDate?: string;
     locationId?: string;
     productId?: string;
     categoryId?: string;
     customerId?: string;
     userId?: string; // For staff/user filters
     page?: number;
     limit?: number;
     sortBy?: string;
     period?: string;
     supplierId?: string; // <<< Added
     status?: string;     // <<< Added (use string for flexibility, validate in controller)
     poNumber?: string;   // <<< Added
     orderNumber?: string;// <<< Added
     returnNumber?: string;// <<< Added
     quantityLte?: string;// <<< Added (example, keep as string for parsing)
     quantityGte?: string;// <<< Added (example, keep as string for parsing)
}
// --- End DTO Definition ---


// Helper function to parse and validate common report query parameters
const parseAndValidateReportQuery = (req: Request): ReportQueryDto => {
     // Pick allowed query parameters
     const query = pick(req.query, [
          'startDate', 'endDate', 'locationId', 'productId', 'categoryId',
          'customerId', 'userId', 'page', 'limit', 'sortBy', 'period',
          'supplierId', 'status', 'poNumber', 'orderNumber', 'returnNumber',
          'quantityLte', 'quantityGte' // Include all picked fields
     ]);

     // Basic type coercion and default values
     // --- FIX: Handle potential undefined before validation ---
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
          period: query.period as string | undefined ?? 'today', // Default period
          supplierId: query.supplierId as string | undefined, // <<< Added assignment
          status: query.status as string | undefined,
          poNumber: query.poNumber as string | undefined,
          orderNumber: query.orderNumber as string | undefined,
          returnNumber: query.returnNumber as string | undefined,
          quantityLte: query.quantityLte as string | undefined,
          quantityGte: query.quantityGte as string | undefined,
          // Assign validated page and limit
          page: !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1,
          limit: !isNaN(limitParam) && limitParam >= 1 && limitParam <= 1000 ? limitParam : 50, // Cap limit
     };
     // --- End FIX ---

     // Note: More specific validation (UUID format, Date format, Enum values)
     // should ideally be handled by class-validator with a DTO passed to validateRequest middleware.
     // This helper provides basic parsing and defaults.

     return parsed;
};


// --- Controller Methods ---

/** Controller for Dashboard KPIs */
const getDashboardKpis = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     // Only pick relevant params for this specific KPI endpoint
     const queryParams = pick(req.query, ['period', 'locationId']) as Pick<ReportQueryDto, 'period' | 'locationId'>;
     const kpiData = await reportingService.getDashboardKpis(tenantId, queryParams);
     res.status(httpStatus.OK).send(kpiData);
});

// --- Sales Reports ---

/** Controller for Sales Summary */
const getSalesSummary = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const summaryData = await reportingService.getSalesSummary(tenantId, {
          startDate: queryParams.startDate,
          endDate: queryParams.endDate,
          locationId: queryParams.locationId,
          userId: queryParams.userId, // Filter by staff member
     });
     res.status(httpStatus.OK).send(summaryData);
});

/** Controller for Sales By Product */
const getSalesByProduct = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await extendedReportingService.getSalesByProduct(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

/** Controller for Sales By Category */
const getSalesByCategory = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await extendedReportingService.getSalesByCategory(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

/** Controller for Sales By Location */
const getSalesByLocation = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await extendedReportingService.getSalesByLocation(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

/** Controller for Sales By Staff */
const getSalesByStaff = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getSalesByStaff service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.getSalesByStaff(tenantId, queryParams);
     // const data = await reportingService.getSalesByStaff(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Sales by Staff report not implemented yet." });
     // --- End FIX ---
});

/** Controller for Payment Methods Summary */
const getPaymentMethodsSummary = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await extendedReportingService.getPaymentMethodsSummary(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

/** Controller for Tax Summary */
const getTaxSummary = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getTaxSummary service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.getTaxSummary(tenantId, queryParams);
     // const data = await reportingService.getTaxSummary(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Tax Summary report not implemented yet." });
     // --- End FIX ---
});


// --- Inventory Reports ---

/** Controller for Inventory On Hand */
const getInventoryOnHand = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     // Pass only relevant params to service
     const inventoryData = await reportingService.getInventoryOnHand(tenantId, {
          locationId: queryParams.locationId,
          productId: queryParams.productId,
          categoryId: queryParams.categoryId, // Pass categoryId if service handles it
          // Pass quantity filters if service handles them
          // quantityLte: queryParams.quantityLte,
          // quantityGte: queryParams.quantityGte,
     });
     res.status(httpStatus.OK).send(inventoryData);
});

/** Controller for Inventory Valuation */
const getInventoryValuation = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await extendedReportingService.getInventoryValuation(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

/** Controller for Low Stock Report */
const getLowStock = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     const data = await extendedReportingService.getLowStock(tenantId, queryParams);
     res.status(httpStatus.OK).send(data);
});

/** Controller for Inventory Movement Ledger */
const getInventoryMovementLedger = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getInventoryMovementLedger service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.queryInventoryTransactions(tenantId, queryParams);
     // const data = await reportingService.queryInventoryTransactions(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Inventory Movement Ledger report not implemented yet." });
     // --- End FIX ---
});

/** Controller for Inventory Adjustment Report */
const getInventoryAdjustmentReport = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getInventoryAdjustmentReport service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.queryAdjustments(tenantId, queryParams);
     // const data = await reportingService.queryAdjustments(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Inventory Adjustment report not implemented yet." });
     // --- End FIX ---
});

/** Controller for Inventory Transfer Report */
const getInventoryTransferReport = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getInventoryTransferReport service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.queryTransfers(tenantId, queryParams);
     // const data = await reportingService.queryTransfers(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Inventory Transfer report not implemented yet." });
     // --- End FIX ---
});


// --- Purchase Order Reports ---

/** Controller for Purchase Order Summary */
const getPurchaseOrderSummary = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getPurchaseOrderSummary service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.getPurchaseOrderSummary(tenantId, queryParams);
     // const data = await reportingService.getPurchaseOrderSummary(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Purchase Order Summary report not implemented yet." });
     // --- End FIX ---
});

/** Controller for Purchase Order Detail Report */
const getPurchaseOrderDetailReport = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getPurchaseOrderDetailReport service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.queryPurchaseOrders(tenantId, queryParams); // Using specific includes maybe?
     // const data = await reportingService.queryPurchaseOrders(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Purchase Order Detail report not implemented yet." });
     // --- End FIX ---
});


// --- Customer Reports ---

/** Controller for Customer Purchase History */
const getCustomerPurchaseHistory = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     // Requires customerId in params - use queryParams.customerId
     if (!queryParams.customerId) throw new ApiError(httpStatus.BAD_REQUEST, 'customerId query parameter is required.');
     logger.warn("getCustomerPurchaseHistory service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.getCustomerPurchaseHistory(tenantId, queryParams.customerId, queryParams);
     // const data = await reportingService.getCustomerPurchaseHistory(tenantId, queryParams.customerId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Customer Purchase History report not implemented yet." });
     // --- End FIX ---
});

/** Controller for Top Customers Report */
const getTopCustomers = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getTopCustomers service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.getTopCustomers(tenantId, queryParams);
     // const data = await reportingService.getTopCustomers(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Top Customers report not implemented yet." });
     // --- End FIX ---
});


// --- POS Operation Reports ---

/** Controller for POS Session Report */
const getPosSessionReport = catchAsync(async (req: Request, res: Response) => {
     // --- FIX: Use tenantId and queryParams ---
     const tenantId = getTenantIdFromRequest(req);
     const queryParams = parseAndValidateReportQuery(req);
     logger.warn("getPosSessionReport service function not implemented yet.", { tenantId, queryParams });
     // TODO: Implement reportingService.getPosSessionReport or query sessions directly using filters
     // const data = await reportingService.getPosSessionReport(tenantId, queryParams);
     // res.status(httpStatus.OK).send(data);
     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "POS Session report not implemented yet." });
     // --- End FIX ---
});


// Export all implemented and placeholder controller methods
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
};


















































// // src/modules/reports/reports.controller.ts
// import { Request, Response } from 'express';
// import httpStatus from 'http-status';
// import { reportingService } from './reports.service'; // Assuming reportingService has all needed methods
// import catchAsync from '@/utils/catchAsync';
// import ApiError from '@/utils/ApiError';
// import pick from '@/utils/pick'; // Utility for filtering/pagination query params
// import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
// // Import DTO and potentially Prisma types if detailed query validation is needed
// import { ReportQueryDto } from './dto/report-query.dto';
// import logger from '@/utils/logger';
// // import { Prisma } from '@prisma/client';

// // Helper function to parse and validate common report query parameters
// // Note: Using a DTO with class-validator via middleware is more robust for complex validation
// const parseAndValidateReportQuery = (req: Request): ReportQueryDto => {
//     // Pick allowed query parameters
//     const query = pick(req.query, [
//         'startDate', 'endDate', 'locationId', 'productId', 'categoryId',
//         'customerId', 'userId', 'page', 'limit', 'sortBy', 'period',
//         'supplierId', 'status', // Added for PO/Transfer/Return etc.
//         'poNumber', 'orderNumber', 'returnNumber', // Added for specific lookups
//         // Add any other common filters relevant across reports
//     ]);

//     // Basic type coercion (DTO validation handles stricter checks)
//     const parsed: ReportQueryDto = {
//         startDate: query.startDate as string | undefined,
//         endDate: query.endDate as string | undefined,
//         locationId: query.locationId as string | undefined,
//         productId: query.productId as string | undefined,
//         categoryId: query.categoryId as string | undefined,
//         customerId: query.customerId as string | undefined,
//         userId: query.userId as string | undefined,
//         page: query.page ? parseInt(query.page as string, 10) : 1,
//         limit: query.limit ? parseInt(query.limit as string, 10) : 50, // Default limit
//         sortBy: query.sortBy as string | undefined,
//         period: query.period as string | undefined ?? 'today', // Default period
//         // Add other potential fields with undefined default
//         supplierId: query.supplierId as string | undefined,
//         status: query.status as string | undefined,
//         poNumber: query.poNumber as string | undefined,
//         orderNumber: query.orderNumber as string | undefined,
//         returnNumber: query.returnNumber as string | undefined,
//     };

//     // Basic validation (more complex validation should use class-validator DTO)
//     if (isNaN(parsed.page) || parsed.page < 1) parsed.page = 1;
//     if (isNaN(parsed.limit) || parsed.limit < 1 || parsed.limit > 1000) parsed.limit = 50; // Cap limit

//     // TODO: Add validation for date formats, UUIDs, enum values if not using DTO validation middleware

//     return parsed;
// };


// // --- Controller Methods ---

// /** Controller for Dashboard KPIs */
// const getDashboardKpis = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     // Only pick relevant params for this specific KPI endpoint
//     const queryParams = pick(req.query, ['period', 'locationId']) as Pick<ReportQueryDto, 'period' | 'locationId'>;
//     const kpiData = await reportingService.getDashboardKpis(tenantId, queryParams);
//     res.status(httpStatus.OK).send(kpiData);
// });

// // --- Sales Reports ---

// /** Controller for Sales Summary */
// const getSalesSummary = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // Pass only relevant params to service
//     const summaryData = await reportingService.getSalesSummary(tenantId, {
//         startDate: queryParams.startDate,
//         endDate: queryParams.endDate,
//         locationId: queryParams.locationId,
//         userId: queryParams.userId, // Filter by staff member
//     });
//     res.status(httpStatus.OK).send(summaryData);
// });

// /** Controller for Sales By Product */
// const getSalesByProduct = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // TODO: Implement reportingService.getSalesByProduct
//     // const data = await reportingService.getSalesByProduct(tenantId, queryParams);
//     logger.warn("getSalesByProduct controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Sales by Product report not implemented yet." });
// });

// /** Controller for Sales By Category */
// const getSalesByCategory = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // TODO: Implement reportingService.getSalesByCategory
//     logger.warn("getSalesByCategory controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Sales by Category report not implemented yet." });
// });

// /** Controller for Sales By Location */
// const getSalesByLocation = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getSalesByLocation
//     logger.warn("getSalesByLocation controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Sales by Location report not implemented yet." });
// });

// /** Controller for Sales By Staff */
// const getSalesByStaff = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getSalesByStaff
//     logger.warn("getSalesByStaff controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Sales by Staff report not implemented yet." });
// });

// /** Controller for Payment Methods Summary */
// const getPaymentMethodsSummary = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getPaymentMethodsSummary
//     logger.warn("getPaymentMethodsSummary controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Payment Methods Summary report not implemented yet." });
// });

// /** Controller for Tax Summary */
// const getTaxSummary = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getTaxSummary
//     logger.warn("getTaxSummary controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Tax Summary report not implemented yet." });
// });


// // --- Inventory Reports ---

// /** Controller for Inventory On Hand */
// const getInventoryOnHand = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // Pass only relevant params to service
//     const inventoryData = await reportingService.getInventoryOnHand(tenantId, {
//         locationId: queryParams.locationId,
//         productId: queryParams.productId,
//         categoryId: queryParams.categoryId, // Service needs logic to filter by category
//     });
//     res.status(httpStatus.OK).send(inventoryData);
// });

// /** Controller for Inventory Valuation */
// const getInventoryValuation = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getInventoryValuation (needs costing method logic)
//     logger.warn("getInventoryValuation controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Inventory Valuation report not implemented yet." });
// });

// /** Controller for Low Stock Report */
// const getLowStock = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getLowStock
//     logger.warn("getLowStock controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Low Stock report not implemented yet." });
// });

// /** Controller for Inventory Movement Ledger */
// const getInventoryMovementLedger = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.queryInventoryTransactions (needs specific filters/sorting)
//     logger.warn("getInventoryMovementLedger controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Inventory Movement Ledger report not implemented yet." });
// });

// /** Controller for Inventory Adjustment Report */
// const getInventoryAdjustmentReport = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // This likely uses the inventoryService.queryAdjustments function directly or reporting service wrapper
//     logger.warn("getInventoryAdjustmentReport controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Inventory Adjustment report not implemented yet." });
// });

// /** Controller for Inventory Transfer Report */
// const getInventoryTransferReport = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // This likely uses the inventoryService.queryTransfers function directly or reporting service wrapper
//     logger.warn("getInventoryTransferReport controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Inventory Transfer report not implemented yet." });
// });


// // --- Purchase Order Reports ---

// /** Controller for Purchase Order Summary */
// const getPurchaseOrderSummary = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getPurchaseOrderSummary
//     logger.warn("getPurchaseOrderSummary controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Purchase Order Summary report not implemented yet." });
// });

// /** Controller for Purchase Order Detail Report */
// const getPurchaseOrderDetailReport = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.queryPurchaseOrders (using specific includes maybe?)
//     logger.warn("getPurchaseOrderDetailReport controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Purchase Order Detail report not implemented yet." });
// });


// // --- Customer Reports ---

// /** Controller for Customer Purchase History */
// const getCustomerPurchaseHistory = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // Requires customerId in params
//     if(!queryParams.customerId) throw new ApiError(httpStatus.BAD_REQUEST, 'customerId query parameter is required.');
//      // TODO: Implement reportingService.getCustomerPurchaseHistory
//     logger.warn("getCustomerPurchaseHistory controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Customer Purchase History report not implemented yet." });
// });

// /** Controller for Top Customers Report */
// const getTopCustomers = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//      // TODO: Implement reportingService.getTopCustomers
//     logger.warn("getTopCustomers controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "Top Customers report not implemented yet." });
// });


// // --- POS Operation Reports ---

// /** Controller for POS Session Report */
// const getPosSessionReport = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const queryParams = parseAndValidateReportQuery(req);
//     // Requires sessionId or date range/user/location filters
//      // TODO: Implement reportingService.getPosSessionReport or query sessions directly
//     logger.warn("getPosSessionReport controller called, but service function not implemented yet.");
//     res.status(httpStatus.NOT_IMPLEMENTED).send({ message: "POS Session report not implemented yet." });
// });


// // Export all implemented and placeholder controller methods
// export const reportingController = {
//     getDashboardKpis,
//     getSalesSummary,
//     getSalesByProduct,
//     getSalesByCategory,
//     getSalesByLocation,
//     getSalesByStaff,
//     getPaymentMethodsSummary,
//     getTaxSummary,
//     getInventoryOnHand,
//     getInventoryValuation,
//     getLowStock,
//     getInventoryMovementLedger,
//     getInventoryAdjustmentReport,
//     getInventoryTransferReport,
//     getPurchaseOrderSummary,
//     getPurchaseOrderDetailReport,
//     getCustomerPurchaseHistory,
//     getTopCustomers,
//     getPosSessionReport,
// };
