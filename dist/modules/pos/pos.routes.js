"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/pos/pos.routes.ts
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const pos_controller_1 = require("./pos.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const start_session_dto_1 = require("./dto/start-session.dto");
const end_session_dto_1 = require("./dto/end-session.dto");
const cash_transaction_dto_1 = require("./dto/cash-transaction.dto");
const pos_checkout_dto_1 = require("./dto/pos-checkout.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const rateLimit_middleware_1 = require("@/middleware/rateLimit.middleware"); // Import rate limiters
const router = express_1.default.Router();
// Apply auth & tenant context middleware globally for this module
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
router.use((0, cookie_parser_1.default)()); // Needed if refresh tokens are used with POS login/sessions
// --- Session Management Routes ---
// Start a new session
router.post('/sessions/start', (0, rbac_middleware_1.checkPermissions)(['pos:session:start']), // Permission to start session
rateLimit_middleware_1.authRateLimiter, // Use stricter rate limit maybe?
(0, validate_middleware_1.default)(start_session_dto_1.StartSessionDto), pos_controller_1.posController.startSession);
// Get current session for the user/terminal sending request (via headers)
router.get('/sessions/current', (0, rbac_middleware_1.checkPermissions)(['pos:session:read']), // Permission to view own session
pos_controller_1.posController.getCurrentSession);
// End a specific session
router.post('/sessions/:sessionId/end', (0, rbac_middleware_1.checkPermissions)(['pos:session:end']), // Permission to end own session
rateLimit_middleware_1.authRateLimiter, (0, validate_middleware_1.default)(end_session_dto_1.EndSessionDto), pos_controller_1.posController.endSession);
// Reconcile a specific session
router.post('/sessions/:sessionId/reconcile', (0, rbac_middleware_1.checkPermissions)(['pos:session:reconcile']), // Permission for managers/admins
pos_controller_1.posController.reconcileSession);
// Record Pay In/Out
router.post('/sessions/:sessionId/cash', (0, rbac_middleware_1.checkPermissions)(['pos:session:cash']), // Permission for cash movements
(0, validate_middleware_1.default)(cash_transaction_dto_1.CashTransactionDto), pos_controller_1.posController.recordCashTransaction);
// Get list of sessions (Admin/Manager view)
router.get('/sessions', (0, rbac_middleware_1.checkPermissions)(['pos:session:list']), // Permission to view all sessions
pos_controller_1.posController.getSessions);
// Get details of a specific session
router.get('/sessions/:sessionId', (0, rbac_middleware_1.checkPermissions)(['pos:session:read']), // Permission to view specific session details
pos_controller_1.posController.getSession);
// --- Checkout Route ---
// Process a checkout transaction within a specific session
router.post('/sessions/:sessionId/checkout', (0, rbac_middleware_1.checkPermissions)(['pos:checkout']), // Permission to perform checkout
rateLimit_middleware_1.generalRateLimiter, // Use general or a specific checkout rate limit
(0, validate_middleware_1.default)(pos_checkout_dto_1.PosCheckoutDto), pos_controller_1.posController.processCheckout);
// --- Offline Sync Route (Placeholder) ---
// router.post(
//     '/sync',
//     checkPermissions(['pos:sync']),
//     // validateRequest(OfflineSyncDto), // DTO for offline batch
//     posController.processOfflineSync
// );
exports.default = router;
//# sourceMappingURL=pos.routes.js.map