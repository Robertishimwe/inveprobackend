// src/modules/pos/pos.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { posService } from './pos.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma, PosSessionStatus } from '@prisma/client';

// Helper to get POS context (add more validation as needed)
const getPosContext = (req: Request) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // Assumes authMiddleware ensures user exists
    const locationId = req.header('X-Location-Id'); // Get location from custom header
    const posTerminalId = req.header('X-Terminal-Id'); // Get terminal from custom header

    if (!locationId) throw new ApiError(httpStatus.BAD_REQUEST, 'X-Location-Id header is required for POS operations.');
    if (!posTerminalId) throw new ApiError(httpStatus.BAD_REQUEST, 'X-Terminal-Id header is required for POS operations.');

    return { tenantId, userId, locationId, posTerminalId };
};

// --- Session Management ---

const startSession = catchAsync(async (req: Request, res: Response) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    // req.body is validated StartSessionDto
    const session = await posService.startSession(req.body, userId, posTerminalId, locationId, tenantId);
    res.status(httpStatus.CREATED).send(session);
});

const getCurrentSession = catchAsync(async (req: Request, res: Response) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    const session = await posService.getCurrentSession(userId, posTerminalId, locationId, tenantId);
    if (!session) { throw new ApiError(httpStatus.NOT_FOUND, 'No active session found for this user/terminal/location.'); }
    res.status(httpStatus.OK).send(session);
});

const endSession = catchAsync(async (req: Request, res: Response) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    const { sessionId } = req.params;
    // req.body is validated EndSessionDto
    const session = await posService.endSession(sessionId, req.body, userId, posTerminalId, locationId, tenantId);
    res.status(httpStatus.OK).send(session);
});

const reconcileSession = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const { sessionId } = req.params;
    // Permission check needed: Only managers/admins?
    const session = await posService.reconcileSession(sessionId, tenantId);
     res.status(httpStatus.OK).send(session);
});

const recordCashTransaction = catchAsync(async (req: Request, res: Response) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req); // Ensure user is at the right terminal/location
    const { sessionId } = req.params;
    // req.body is validated CashTransactionDto
    // Service ensures session is open and belongs to user
    const transaction = await posService.recordCashTransaction(sessionId, req.body, userId, tenantId);
    res.status(httpStatus.CREATED).send(transaction);
});

const getSession = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const session = await posService.getSessionById(req.params.sessionId, tenantId);
     if (!session) { throw new ApiError(httpStatus.NOT_FOUND, 'Session not found'); }
     res.status(httpStatus.OK).send(session);
});

const getSessions = catchAsync(async (req: Request, res: Response) => {
     const tenantId = getTenantIdFromRequest(req);
     const filterParams = pick(req.query, ['locationId', 'userId', 'terminalId', 'status', 'dateFrom', 'dateTo']);
     const options = pick(req.query, ['sortBy', 'limit', 'page']);

     const filter: Prisma.PosSessionWhereInput = { tenantId };
     if (filterParams.locationId) filter.locationId = filterParams.locationId as string;
     if (filterParams.userId) filter.userId = filterParams.userId as string;
     if (filterParams.terminalId) filter.posTerminalId = filterParams.terminalId as string;
     if (filterParams.status && Object.values(PosSessionStatus).includes(filterParams.status as PosSessionStatus)) {
         filter.status = filterParams.status as PosSessionStatus;
     } else if (filterParams.status) { /* throw bad request */ }
      if (filterParams.dateFrom || filterParams.dateTo) {
         filter.startTime = {}; // Filter on start time range
         try {
            if (filterParams.dateFrom) filter.startTime.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.startTime.lte = new Date(filterParams.dateTo as string);
        } catch (e) { /* throw bad date format error */ }
    }

     const orderBy: Prisma.PosSessionOrderByWithRelationInput[] = [];
      if (options.sortBy) {
          (options.sortBy as string).split(',').forEach(sortOption => { /* build orderby */ });
      }
      if (orderBy.length === 0) { orderBy.push({ startTime: 'desc' }); }

      const limit = parseInt(options.limit as string) || 10;
      const page = parseInt(options.page as string) || 1;

      const result = await posService.querySessions(filter, orderBy, limit, page);
      res.status(httpStatus.OK).send({ /* paginated result */ });
});

// --- Checkout Controller ---
const processCheckout = catchAsync(async (req: Request, res: Response) => {
    const { tenantId, userId, locationId, posTerminalId } = getPosContext(req);
    const { sessionId } = req.params; // Session ID must be provided in the URL for checkout
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    // req.body is validated PosCheckoutDto

    const order = await posService.processPosCheckout(
        req.body, sessionId, tenantId, userId, posTerminalId, locationId, ipAddress, userAgent
    );

    // Send back details of the created order
    res.status(httpStatus.CREATED).send(order);
});


export const posController = {
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
