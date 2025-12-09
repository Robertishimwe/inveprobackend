// src/modules/tenants/tenant.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { tenantService } from './tenant.service'; // Assuming tenantService has all needed methods
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // Utility for filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get own tenantId
import { Prisma, TenantStatus } from '@prisma/client'; // Import Prisma types and enums for validation
import logger from '@/utils/logger';

// --- Super Admin Controllers ---

/**
 * Controller for Super Admin to create a new tenant.
 * Expects tenant details and initial admin user ID in the request body.
 */
const createTenant = catchAsync(async (req: Request, res: Response) => {
    // Permission 'tenant:create:any' assumed checked by middleware
    // req.body validated against CreateTenantDto by middleware
    const tenant = await tenantService.createTenantWithDefaults(req.body);
    res.status(httpStatus.CREATED).send(tenant);
});

/**
 * Controller for Super Admin to list tenants with filtering and pagination.
 */
const getTenants = catchAsync(async (req: Request, res: Response) => {
    // Permission 'tenant:read:any' assumed checked by middleware

    // Define allowed filters from query parameters
    const filterParams = pick(req.query, ['name', 'status']);
    // Define allowed options for sorting and pagination
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object (NO automatic tenantId scope for super admin)
    const filter: Prisma.TenantWhereInput = {};
    if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
    // Validate status against enum values before applying filter
    if (filterParams.status && Object.values(TenantStatus).includes(filterParams.status as TenantStatus)) {
        filter.status = filterParams.status as TenantStatus;
    } else if (filterParams.status) {
        // If an invalid status is provided, throw an error
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(TenantStatus).join(', ')}`);
    }

    // Build Prisma OrderBy array
    const orderBy: Prisma.TenantOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for Tenant model
                if (['name', 'status', 'createdAt', 'updatedAt', 'deactivatedAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ name: 'asc' }); // Default sort by name
    }

    // Parse pagination options
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call the service
    const result = await tenantService.queryTenants(filter, orderBy, limit, page);

    // Format and send the paginated response
    res.status(httpStatus.OK).send({
        results: result.tenants,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});

/**
 * Controller for Super Admin to get a specific tenant by ID.
 */
const getTenant = catchAsync(async (req: Request, res: Response) => {
    // Permission 'tenant:read:any' assumed checked by middleware
    const tenant = await tenantService.getTenantById(req.params.tenantId);
    if (!tenant) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
    }
    res.status(httpStatus.OK).send(tenant);
});

/**
 * Controller for Super Admin to update a tenant's basic info or status.
 */
const updateTenant = catchAsync(async (req: Request, res: Response) => {
    // Permission 'tenant:update:any' assumed checked by middleware
    // req.body validated against UpdateTenantDto by middleware
    const tenant = await tenantService.updateTenantById(req.params.tenantId, req.body);
    res.status(httpStatus.OK).send(tenant);
});

/**
 * Controller for Super Admin to deactivate (soft delete) a tenant.
 */
const deactivateTenant = catchAsync(async (req: Request, res: Response) => {
    // Permission 'tenant:delete:any' assumed checked by middleware
    // req.body (optional notes) validated against TenantActionDto by middleware
    const tenant = await tenantService.deactivateTenantById(req.params.tenantId, req.body);
    res.status(httpStatus.OK).send(tenant); // Return deactivated tenant
});

/**
 * Controller for Super Admin to set/replace administrators for a tenant.
 */
const setTenantAdmins = catchAsync(async (req: Request, res: Response) => {
    const { tenantId } = req.params; // Get tenant ID from URL
    // req.body validated against ManageTenantAdminsDto by middleware
    const { adminUserIds } = req.body; // Extract validated user IDs

    // Permission 'tenant:manage:admins' assumed checked by middleware

    await tenantService.setTenantAdmins(tenantId, adminUserIds);
    res.status(httpStatus.OK).send({ message: `Successfully set administrators for tenant ${tenantId}.` });
});


// --- Tenant Admin Controllers ---

/**
 * Controller for Tenant Admin to get their own tenant details/config.
 */
const getOwnTenant = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req); // Get own tenant ID from authenticated user's context
    // Permission 'tenant:config:read' assumed checked by middleware

    const tenant = await tenantService.getTenantById(tenantId); // Fetch own tenant
    if (!tenant) {
        // This should technically not happen if user is authenticated correctly with a tenant context
        logger.error(`Tenant Admin (${req.user?.id}) could not find their own tenant (${tenantId})`);
        throw new ApiError(httpStatus.NOT_FOUND, 'Associated tenant data not found.');
    }
    // Optionally filter response to only show relevant config fields to tenant admin
    res.status(httpStatus.OK).send(tenant);
});

/**
 * Controller for Tenant Admin to update their own tenant's configuration subset.
 */
const updateOwnTenantConfig = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req); // Get own tenant ID
    // Permission 'tenant:config:update' assumed checked by middleware
    // req.body validated against UpdateTenantConfigDto by middleware

    const tenant = await tenantService.updateOwnTenantConfig(tenantId, req.body);
    res.status(httpStatus.OK).send(tenant);
});

/**
 * Controller for Tenant Admin to send a test email to verify SMTP configuration.
 */
const sendTestEmail = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const { email } = req.body;

    if (!email) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Email address is required');
    }

    // Import email service dynamically to avoid circular dependencies
    const { sendEmail, verifySmtpConnection } = await import('../notifications/email.service');

    // First verify connection
    const verifyResult = await verifySmtpConnection(tenantId);
    if (!verifyResult.success) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `SMTP connection failed: ${verifyResult.error || 'Unknown error'}. Please check your SMTP settings.`
        );
    }

    // Send test email
    const result = await sendEmail(tenantId, {
        to: email,
        subject: '✅ InvePro Test Email - SMTP Configuration Successful!',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #10b981;">🎉 SMTP Configuration Verified!</h1>
                <p>Congratulations! Your InvePro email settings are working correctly.</p>
                <p>You will now receive notifications for:</p>
                <ul>
                    <li>📦 Low Stock Alerts</li>
                    <li>🚫 Stock Out Warnings</li>
                    <li>📋 Purchase Order Updates</li>
                </ul>
                <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #6b7280; font-size: 12px;">
                    This is a test email from your InvePro inventory system.
                </p>
            </div>
        `,
        text: 'SMTP Configuration Verified! Your InvePro email settings are working correctly.',
    });

    if (!result.success) {
        throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            `Failed to send email: ${result.error}`
        );
    }

    res.status(httpStatus.OK).send({
        success: true,
        message: `Test email sent successfully to ${email}`,
        messageId: result.messageId,
    });
});


// Export all controller methods
export const tenantController = {
    // Super Admin actions
    createTenant,
    getTenants,
    getTenant,
    updateTenant,
    deactivateTenant,
    setTenantAdmins, // Added controller method
    // Tenant Admin actions
    getOwnTenant,
    updateOwnTenantConfig,
    sendTestEmail,
};