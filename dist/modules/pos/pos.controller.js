"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.posController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const pos_service_1 = require("./pos.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick"));
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const client_1 = require("@prisma/client");
// Helper to get POS context (add more validation as needed)
const getPosContext = (req) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.user.id; // Assumes authMiddleware ensures user exists
    const locationId = req.header('X-Location-Id'); // Get location from custom header
    const posTerminalId = req.header('X-Terminal-Id'); // Get terminal from custom header
    if (!locationId)
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'X-Location-Id header is required for POS operations.');
    if (!posTerminalId)
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'X-Terminal-Id header is required for POS operations.');
    return { tenantId, userId, locationId, posTerminalId };
};
// --- Session Management ---
const startSession = (0, catchAsync_1.default)(async (req, res) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    // req.body is validated StartSessionDto
    const session = await pos_service_1.posService.startSession(req.body, userId, posTerminalId, locationId, tenantId);
    res.status(http_status_1.default.CREATED).send(session);
});
const getCurrentSession = (0, catchAsync_1.default)(async (req, res) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    const session = await pos_service_1.posService.getCurrentSession(userId, posTerminalId, locationId, tenantId);
    if (!session) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'No active session found for this user/terminal/location.');
    }
    res.status(http_status_1.default.OK).send(session);
});
const endSession = (0, catchAsync_1.default)(async (req, res) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    const { sessionId } = req.params;
    // req.body is validated EndSessionDto
    const session = await pos_service_1.posService.endSession(sessionId, req.body, userId, posTerminalId, locationId, tenantId);
    res.status(http_status_1.default.OK).send(session);
});
const reconcileSession = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const { sessionId } = req.params;
    // Permission check needed: Only managers/admins?
    const session = await pos_service_1.posService.reconcileSession(sessionId, tenantId);
    res.status(http_status_1.default.OK).send(session);
});
const recordCashTransaction = (0, catchAsync_1.default)(async (req, res) => {
    // const { tenantId, userId, locationId, posTerminalId } = getPosContext(req); // Ensure user is at the right terminal/location
    const { tenantId, userId } = getPosContext(req);
    const { sessionId } = req.params;
    // req.body is validated CashTransactionDto
    // Service ensures session is open and belongs to user
    const transaction = await pos_service_1.posService.recordCashTransaction(sessionId, req.body, userId, tenantId);
    res.status(http_status_1.default.CREATED).send(transaction);
});
const getSession = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const session = await pos_service_1.posService.getSessionById(req.params.sessionId, tenantId);
    if (!session) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Session not found');
    }
    res.status(http_status_1.default.OK).send(session);
});
const getSessions = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const filterParams = (0, pick_1.default)(req.query, ['locationId', 'userId', 'terminalId', 'status', 'dateFrom', 'dateTo']);
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    const filter = { tenantId };
    if (filterParams.locationId)
        filter.locationId = filterParams.locationId;
    if (filterParams.userId)
        filter.userId = filterParams.userId;
    if (filterParams.terminalId)
        filter.posTerminalId = filterParams.terminalId;
    if (filterParams.status && Object.values(client_1.PosSessionStatus).includes(filterParams.status)) {
        filter.status = filterParams.status;
    }
    else if (filterParams.status) { /* throw bad request */ }
    if (filterParams.dateFrom || filterParams.dateTo) {
        filter.startTime = {}; // Filter on start time range
        try {
            if (filterParams.dateFrom)
                filter.startTime.gte = new Date(filterParams.dateFrom);
            if (filterParams.dateTo)
                filter.startTime.lte = new Date(filterParams.dateTo);
        }
        catch (e) { /* throw bad date format error */ }
    }
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => { });
    }
    if (orderBy.length === 0) {
        orderBy.push({ startTime: 'desc' });
    }
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    const result = await pos_service_1.posService.querySessions(filter, orderBy, limit, page);
    //   res.status(httpStatus.OK).send({ /* paginated result */ });
    res.status(http_status_1.default.OK).send({ result });
});
// --- Checkout Controller ---
const processCheckout = (0, catchAsync_1.default)(async (req, res) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    const { sessionId } = req.params; // Session ID must be provided in the URL for checkout
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    // req.body is validated PosCheckoutDto
    const order = await pos_service_1.posService.processPosCheckout(req.body, sessionId, tenantId, userId, posTerminalId, locationId, ipAddress, userAgent);
    // Send back details of the created order
    res.status(http_status_1.default.CREATED).send(order);
});
exports.posController = {
    // Sessions
    startSession,
    getCurrentSession,
    endSession,
    reconcileSession,
    recordCashTransaction,
    getSession,
    getSessions,
    // Checkout
    processCheckout,
    // Offline Sync (Placeholder)
    // processOfflineSync: catchAsync(async (req, res) => { /* ... */ }),
};
//# sourceMappingURL=pos.controller.js.map