// src/modules/reports/reports.routes.ts
import express from 'express';
import { reportingController } from './reports.controller'; // Import the controller
import { authMiddleware } from '@/middleware/auth.middleware'; // Standard auth middleware
import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Standard tenant check
import { checkPermissions } from '@/middleware/rbac.middleware'; // RBAC middleware
// Optional: Import DTO and validation middleware for query params
// import validateRequest from '@/middleware/validate.middleware';
// import { ReportQueryDto } from './dto';

const router = express.Router();

// Apply standard authentication and tenant scoping to all reporting routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// --- Define Report Routes ---

// --- Dashboard ---
/**
 * GET /api/v1/reports/dashboard-kpi
 * Retrieves key performance indicators for the dashboard overview.
 * Requires appropriate dashboard view permissions.
 */
router.get(
    '/dashboard-kpi',
    // Example: Requires view permission for key areas shown on dashboard
    checkPermissions(['dashboard:view', 'report:view:sales', 'report:view:inventory']),
    // validateRequest(ReportQueryDto, 'query'), // Optional: Validate query params like 'period', 'locationId'
    reportingController.getDashboardKpis
);

// --- Sales Reports ---
/** GET /api/v1/reports/sales-summary */
router.get(
    '/sales-summary',
    checkPermissions(['report:view:sales']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getSalesSummary
);

/** GET /api/v1/reports/sales-by-product */
router.get(
    '/sales-by-product',
    checkPermissions(['report:view:sales']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getSalesByProduct
);

/** GET /api/v1/reports/sales-by-category */
router.get(
    '/sales-by-category',
    checkPermissions(['report:view:sales']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getSalesByCategory
);

/** GET /api/v1/reports/sales-by-location */
router.get(
    '/sales-by-location',
    checkPermissions(['report:view:sales']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getSalesByLocation
);

/** GET /api/v1/reports/sales-by-staff */
router.get(
    '/sales-by-staff',
    checkPermissions(['report:view:sales']), // Might need finer control if staff can only see own sales
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getSalesByStaff
);

/** GET /api/v1/reports/payment-methods-summary */
router.get(
    '/payment-methods-summary',
    checkPermissions(['report:view:sales']), // Often grouped with sales
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getPaymentMethodsSummary
);

/** GET /api/v1/reports/tax-summary */
router.get(
    '/tax-summary',
    checkPermissions(['report:view:sales']), // Often grouped with sales/finance
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getTaxSummary
);


// --- Inventory Reports ---
/** GET /api/v1/reports/inventory-on-hand */
router.get(
    '/inventory-on-hand',
    checkPermissions(['report:view:inventory']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getInventoryOnHand
);

/** GET /api/v1/reports/inventory-valuation */
router.get(
    '/inventory-valuation',
    checkPermissions(['report:view:inventory', 'inventory:valuation:read']), // Specific permission potentially
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getInventoryValuation
);

/** GET /api/v1/reports/low-stock */
router.get(
    '/low-stock',
    checkPermissions(['report:view:inventory']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getLowStock
);

/** GET /api/v1/reports/inventory-movement-ledger */
router.get(
    '/inventory-movement-ledger',
    checkPermissions(['inventory:read:transactions']), // Use specific transaction read permission
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getInventoryMovementLedger
);

/** GET /api/v1/reports/inventory-adjustment-report */
router.get(
    '/inventory-adjustment-report',
    checkPermissions(['inventory:adjust:read']), // Use specific adjustment read permission
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getInventoryAdjustmentReport
);

/** GET /api/v1/reports/inventory-transfer-report */
router.get(
    '/inventory-transfer-report',
    checkPermissions(['inventory:transfer:read']), // Use specific transfer read permission
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getInventoryTransferReport
);


// --- Purchase Order Reports ---
/** GET /api/v1/reports/purchase-order-summary */
router.get(
    '/purchase-order-summary',
    checkPermissions(['report:view:purchasing', 'po:read']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getPurchaseOrderSummary
);

/** GET /api/v1/reports/purchase-order-detail-report */
router.get(
    '/purchase-order-detail-report',
    checkPermissions(['report:view:purchasing', 'po:read']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getPurchaseOrderDetailReport
);


// --- Customer Reports ---
/** GET /api/v1/reports/customer-purchase-history */
router.get(
    '/customer-purchase-history', // Consider nesting under /customers/:id/purchase-history ?
    checkPermissions(['report:view:customer', 'customer:read']),
    // validateRequest(ReportQueryDto, 'query'), // Requires customerId query param
    reportingController.getCustomerPurchaseHistory
);

/** GET /api/v1/reports/top-customers */
router.get(
    '/top-customers',
    checkPermissions(['report:view:customer']),
    // validateRequest(ReportQueryDto, 'query'),
    reportingController.getTopCustomers
);


// --- POS Operation Reports ---
/** GET /api/v1/reports/pos-session-report */
router.get(
    '/pos-session-report',
    checkPermissions(['report:view:pos', 'pos:session:read:any']),
    // validateRequest(ReportQueryDto, 'query'), // Needs filters like sessionId, date range etc.
    reportingController.getPosSessionReport
);


// Export the configured router
export default router;