// src/modules/stock-counts/stock-count.routes.ts
import express from 'express';
import { stockCountController } from './stock-count.controller';
import validateRequest from '@/middleware/validate.middleware';
// Import necessary DTOs
import { InitiateStockCountDto, EnterCountsDto, ReviewCountDto } from './dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context to all stock count routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// --- Define Stock Count Routes ---

router.route('/')
    /**
     * POST /api/v1/stock-counts
     * Initiates a new stock count process (FULL or CYCLE).
     * Requires 'inventory:count:start' permission.
     */
    .post(
        checkPermissions(['inventory:count:start']),
        validateRequest(InitiateStockCountDto),
        stockCountController.initiateStockCount
    )
    /**
     * GET /api/v1/stock-counts
     * Retrieves a paginated list of stock counts within the tenant.
     * Requires 'inventory:count:read' permission (or similar).
     */
    .get(
        checkPermissions(['inventory:count:read']), // Define appropriate read permission
        stockCountController.getStockCounts
    );

router.route('/:stockCountId')
    /**
     * GET /api/v1/stock-counts/:stockCountId
     * Retrieves details of a specific stock count, including its items.
     * Requires 'inventory:count:read' permission.
     */
    .get(
        checkPermissions(['inventory:count:read']),
        stockCountController.getStockCount
    );
    // PATCH could potentially be used for cancelling a PENDING count

/**
 * POST /api/v1/stock-counts/:stockCountId/count
 * Submits counted quantities for items within the stock count.
 * Requires 'inventory:count:enter' permission.
 */
router.post(
    '/:stockCountId/count',
    checkPermissions(['inventory:count:enter']),
    validateRequest(EnterCountsDto), // Validate the array of counted items
    stockCountController.enterCountData
);

/**
 * POST /api/v1/stock-counts/:stockCountId/review
 * Submits review actions (Approve, Recount, Skip) for counted items.
 * Requires 'inventory:count:review' permission.
 */
router.post(
    '/:stockCountId/review',
    checkPermissions(['inventory:count:review']),
    validateRequest(ReviewCountDto), // Validate the array of review actions
    stockCountController.reviewStockCount
);

/**
 * POST /api/v1/stock-counts/:stockCountId/post
 * Finalizes the count and posts approved variances as inventory adjustments.
 * Requires 'inventory:count:approve' permission.
 */
router.post(
    '/:stockCountId/post',
    checkPermissions(['inventory:count:approve']),
    // No request body needed, action depends on state
    stockCountController.postStockCountAdjustments
);


// Export the configured router
export default router;
