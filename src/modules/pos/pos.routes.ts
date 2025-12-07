// src/modules/pos/pos.routes.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import { posController } from './pos.controller';
import validateRequest from '@/middleware/validate.middleware';
import { StartSessionDto } from './dto/start-session.dto';
import { EndSessionDto } from './dto/end-session.dto';
import { CashTransactionDto } from './dto/cash-transaction.dto';
import { PosCheckoutDto } from './dto/pos-checkout.dto';
import { PosSuspendDto } from './dto/pos-suspend.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';
import { authRateLimiter, generalRateLimiter } from '@/middleware/rateLimit.middleware'; // Import rate limiters

const router = express.Router();

// Apply auth & tenant context middleware globally for this module
router.use(authMiddleware);
router.use(ensureTenantContext);
router.use(cookieParser()); // Needed if refresh tokens are used with POS login/sessions

// --- Session Management Routes ---

// Start a new session
router.post(
    '/sessions/start',
    checkPermissions(['pos:session:start']), // Permission to start session
    authRateLimiter, // Use stricter rate limit maybe?
    validateRequest(StartSessionDto),
    posController.startSession
);

// Get current session for the user/terminal sending request (via headers)
router.get(
    '/sessions/current',
    checkPermissions(['pos:session:read']), // Permission to view own session
    posController.getCurrentSession
);

// End a specific session
router.post(
    '/sessions/:sessionId/end',
    checkPermissions(['pos:session:end']), // Permission to end own session
    authRateLimiter,
    validateRequest(EndSessionDto),
    posController.endSession
);

// Reconcile a specific session
router.post(
    '/sessions/:sessionId/reconcile',
    checkPermissions(['pos:session:reconcile']), // Permission for managers/admins
    posController.reconcileSession
);

// Record Pay In/Out
router.post(
    '/sessions/:sessionId/cash',
    checkPermissions(['pos:session:cash']), // Permission for cash movements
    validateRequest(CashTransactionDto),
    posController.recordCashTransaction
);

// Get list of sessions (Admin/Manager view)
router.get(
    '/sessions',
    checkPermissions(['pos:session:list']), // Permission to view all sessions
    posController.getSessions
);

// Get details of a specific session
router.get(
    '/sessions/:sessionId',
    checkPermissions(['pos:session:read']), // Permission to view specific session details
    posController.getSession
);


// --- Checkout Route ---

// Process a checkout transaction within a specific session
router.post(
    '/sessions/:sessionId/checkout',
    checkPermissions(['pos:checkout']), // Permission to perform checkout
    generalRateLimiter, // Use general or a specific checkout rate limit
    validateRequest(PosCheckoutDto),
    posController.processCheckout
);

// Suspend an order
router.post(
    '/sessions/:sessionId/suspend',
    checkPermissions(['pos:checkout']), // Same permission as checkout
    validateRequest(PosSuspendDto),
    posController.suspendOrder
);

// Get suspended orders for the current location
router.get(
    '/sales/suspended',
    checkPermissions(['pos:checkout']), // Permission to retrieve suspended orders
    posController.getSuspendedOrders
);

// Resume (delete) a suspended order after recall
router.delete(
    '/sales/suspended/:orderId',
    checkPermissions(['pos:checkout']), // Same permission as checkout
    posController.resumeOrder
);

export default router;
