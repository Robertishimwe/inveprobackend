// src/modules/tenants/tenant.service.ts
import httpStatus from 'http-status';
import {
    Prisma, Tenant, TenantStatus, Role, Permission, UserRole, // Ensure needed types imported
} from '@prisma/client';
import { prisma } from '@/config'; // Centralized Prisma client
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
// Import all necessary DTOs for this service
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { TenantActionDto } from './dto/tenant-action.dto';
// Import utilities only if needed (e.g., for password reset if re-added)
// import { generateSecureToken, hashToken } from '@/utils/token.utils';
import { emailService } from '@/utils/email.service';
// import { env } from '@/config'; // Only if needed (e.g. for FRONTEND_URL in emails)
// import pick from '@/utils/pick'; // Import pick utility

// Define log context type if not already defined globally
type LogContext = { function?: string; tenantId?: string | null; adminUserId?: string | null; userId?: string | null; roleId?: string | null; permissionId?: string | null; data?: any; error?: any;[key: string]: any; };

// Type helpers (can be moved to a types file)
export type RoleWithPermissions = Role & { permissions: ({ permission: Permission })[] };

// Default Roles Configuration
const DEFAULT_TENANT_ROLES_CONFIG: { name: string; description: string; isSystemRole: boolean; permissions: string[] }[] = [
    { name: 'Admin', description: 'Tenant Administrator', isSystemRole: true, permissions: ['ALL'] },
    { name: 'Manager', description: 'Standard Manager Role', isSystemRole: false, permissions: [ /* List relevant permissionKeys */ 'dashboard:view', 'user:read:any', 'product:read', 'order:read:any', 'inventory:read:levels', 'report:view:sales'] },
    { name: 'Staff', description: 'Standard Staff Role', isSystemRole: false, permissions: [ /* List relevant permissionKeys */ 'dashboard:view', 'product:read', 'customer:read', 'order:read:own', 'pos:checkout'] },
    // Add other default roles like 'Warehouse Staff', 'Analyst' here
];
const TENANT_ADMIN_ROLE_NAME = 'Admin'; // Consistent name reference used internally

// --- Helper Function: Upsert Role With Permissions ---
// Creates/Updates a role and sets its exact permission list within a transaction
async function upsertRoleWithPermissions(
    tx: Prisma.TransactionClient, // Accept transaction client
    tenantId: string,
    roleName: string,
    description: string,
    isSystemRole: boolean,
    permissionKeys: string[] // Array of permissionKey strings
): Promise<{ id: string }> { // Return only ID
    const logContext: LogContext = { function: 'upsertRoleWithPermissions', tenantId, roleName };

    let permissionIdsToAssign: string[] = [];
    if (permissionKeys.length > 0) {
        const filter = permissionKeys.includes('ALL') ? {} : { permissionKey: { in: permissionKeys } };
        const permissionsToAssign = await tx.permission.findMany({ where: filter, select: { id: true, permissionKey: true } });
        permissionIdsToAssign = permissionsToAssign.map(p => p.id);
        const foundKeys = permissionsToAssign.map(p => p.permissionKey);

        if (!permissionKeys.includes('ALL') && permissionIdsToAssign.length !== permissionKeys.length) {
            const missingKeys = permissionKeys.filter(key => !foundKeys.includes(key));
            // Log warning using logger now
            logger.warn(`[Tenant Setup] Could not find all permissions for role '${roleName}'. Missing keys: ${missingKeys.join(', ')}. Ensure they are in CORE_PERMISSIONS array.`, logContext);
        }
    }

    // Upsert the role itself using the transaction client
    const role = await tx.role.upsert({
        where: { tenantId_name: { tenantId: tenantId, name: roleName } },
        update: { description: description, isSystemRole: isSystemRole },
        create: { name: roleName, description: description, tenantId: tenantId, isSystemRole: isSystemRole },
        select: { id: true }
    });

    // Set exactly the specified permissions using the transaction client
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionIdsToAssign.length > 0) {
        await tx.rolePermission.createMany({
            data: permissionIdsToAssign.map(permissionId => ({ roleId: role.id, permissionId: permissionId })),
            skipDuplicates: true
        });
    }

    logger.debug(`Role '${roleName}' ensured/updated with ${permissionIdsToAssign.length} permissions for tenant ${tenantId}.`, logContext);
    return role;
}


// --- Tenant Service Methods ---

/**
 * Create a new Tenant, default roles, and assign an EXISTING user as the initial Admin.
 * Intended for Super Admin use.
 * @param {CreateTenantDto} data - Tenant creation data including initialAdminUserId.
 * @returns {Promise<Tenant>} The created tenant object.
 */
const createTenantWithDefaults = async (data: CreateTenantDto): Promise<Tenant> => {
    const logContext: LogContext = { function: 'createTenantWithDefaults', tenantName: data.name, initialAdminUserId: data.initialAdminUserId };

    // 1. Check if tenant name already exists
    const nameExists = await prisma.tenant.count({ where: { name: data.name } });
    if (nameExists > 0) {
        logger.warn(`Tenant creation failed: Name "${data.name}" already exists.`, logContext);
        throw new ApiError(httpStatus.CONFLICT, `Tenant name "${data.name}" already exists.`);
    }

    // 2. Find the specified initial admin user
    const initialAdminUser = await prisma.user.findUnique({
        where: { id: data.initialAdminUserId },
        select: { id: true, tenantId: true, email: true, firstName: true } // Fetch necessary fields
    });
    if (!initialAdminUser) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Specified initial admin user ID "${data.initialAdminUserId}" not found.`);
    }
    // 3. CRITICAL: Ensure the user doesn't already belong to another tenant.
    if (initialAdminUser.tenantId !== null) {
        logContext.existingTenantId = initialAdminUser.tenantId;
        logger.error(`Tenant creation failed: User ${data.initialAdminUserId} already belongs to a tenant`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, `User "${initialAdminUser.email}" is already assigned to a tenant and cannot be assigned to a new one.`);
    }
    logContext.adminEmail = initialAdminUser.email; // Add email for context

    // 4. Prepare initial configuration
    let initialConfigObject: Prisma.JsonObject | undefined = undefined;
    if (data.initialConfiguration) {
        try {
            const parsed = JSON.parse(data.initialConfiguration);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                initialConfigObject = parsed as Prisma.JsonObject;
            } else { throw new Error('Parsed configuration is not a valid JSON object.'); }
        }
        catch (e: any) {
            logContext.error = e;
            logger.warn(`Tenant creation failed: Invalid JSON for initialConfiguration`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for initial configuration.');
        }
    }

    // 5. Use transaction for atomicity
    try {
        const newTenant = await prisma.$transaction(async (tx) => {
            // Create Tenant
            const tenant = await tx.tenant.create({
                data: {
                    name: data.name,
                    status: TenantStatus.ACTIVE, // Default to ACTIVE
                    configuration: initialConfigObject ?? Prisma.JsonNull, // Assign object or JsonNull
                    companyPhone: data.companyPhone,
                    website: data.website,
                    email: data.email,
                    companyAddress: data.companyAddress,
                    tin: data.tin,
                }
            });
            logContext.tenantId = tenant.id;
            logger.info(`Tenant created: ${tenant.id}`, logContext);

            // Create Default Roles for the new tenant
            const allPermissions = await tx.permission.findMany({ select: { id: true, permissionKey: true } });
            const createdRolesMap = new Map<string, { id: string }>();
            for (const roleDef of DEFAULT_TENANT_ROLES_CONFIG) {
                const relevantPermissionKeys = roleDef.permissions.includes('ALL') ? allPermissions.map(p => p.permissionKey) : roleDef.permissions;
                const role = await upsertRoleWithPermissions(tx, tenant.id, roleDef.name, roleDef.description, roleDef.isSystemRole, relevantPermissionKeys);
                createdRolesMap.set(roleDef.name, role);
            }
            const adminRoleId = createdRolesMap.get(TENANT_ADMIN_ROLE_NAME)?.id;
            if (!adminRoleId) {
                logger.error(`Default "${TENANT_ADMIN_ROLE_NAME}" role missing after creation for tenant ${tenant.id}`, logContext);
                throw new Error(`Failed to create or find the default "${TENANT_ADMIN_ROLE_NAME}" role during tenant setup.`);
            }

            // Associate the initial admin user with the new tenant AND the admin role
            await tx.user.update({ where: { id: data.initialAdminUserId }, data: { tenantId: tenant.id } });
            await tx.userRole.create({ data: { userId: data.initialAdminUserId, roleId: adminRoleId } });
            logContext.adminUserId = data.initialAdminUserId;
            logger.info(`Assigned existing user ${data.initialAdminUserId} as Admin to new tenant ${tenant.id}`, logContext);

            // Optionally send notification email
            try {
                await emailService.sendEmail({
                    to: initialAdminUser.email!,
                    subject: `Tenant "${tenant.name}" Created`,
                    text: `Hello ${initialAdminUser.firstName || 'Admin'},\n\nThe tenant "${tenant.name}" has been successfully created and your user account has been assigned as the administrator.`
                });
                logger.info(`Sent tenant creation notification email to ${initialAdminUser.email}`, logContext);
            } catch (emailError) {
                logger.error(`Failed to send tenant creation notification email to ${initialAdminUser.email} for tenant ${tenant.id}`, { ...logContext, error: emailError });
                // Non-fatal error for tenant creation
            }

            return tenant;
        });

        logger.info(`Tenant ${newTenant.name} (${newTenant.id}) created successfully with initial admin ${data.initialAdminUserId}.`, logContext);
        return newTenant;

    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error creating tenant with defaults`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const target = (error.meta?.target as string[])?.join(', ');
            throw new ApiError(httpStatus.CONFLICT, `Tenant creation failed due to unique constraint violation on: ${target || 'unknown field'}.`);
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create tenant.');
    }
};


/** Query Tenants (Super Admin) */
const queryTenants = async (filter: Prisma.TenantWhereInput, orderBy: Prisma.TenantOrderByWithRelationInput[], limit: number, page: number): Promise<{ tenants: Tenant[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const logContext: LogContext = { function: 'queryTenants', limit, page, filter: filter }; // Log filter for debugging
    try {
        // Super admin view - no automatic tenant filter applied unless passed in filter
        const queryFilter: Prisma.TenantWhereInput = { ...filter };
        if ('tenantId' in queryFilter) delete queryFilter.tenantId; // Defensive removal

        const [tenants, totalResults] = await prisma.$transaction([
            prisma.tenant.findMany({ where: queryFilter, include: { _count: { select: { users: true } } }, orderBy, skip, take: limit }),
            prisma.tenant.count({ where: queryFilter }),
        ]);
        logger.debug(`Tenant query successful, found ${tenants.length} of ${totalResults}`, logContext);
        return { tenants, totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying tenants`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve tenants.');
    }
};

/** Get Tenant By ID (Super Admin) */
const getTenantById = async (tenantId: string): Promise<Tenant | null> => {
    const logContext: LogContext = { function: 'getTenantById', tenantId };
    try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            logger.warn(`Tenant not found`, logContext);
            return null;
        }
        logger.debug(`Tenant found successfully`, logContext);
        return tenant;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching tenant by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve tenant.');
    }
};

/** Update Tenant By ID (Super Admin) - Handles status changes including SUSPENDED */
const updateTenantById = async (tenantId: string, updateData: UpdateTenantDto): Promise<Tenant> => {
    const logContext: LogContext = { function: 'updateTenantById', tenantId, data: updateData };
    const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found.');

    if (updateData.status === TenantStatus.DEACTIVATED) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Use the dedicated deactivate endpoint to deactivate a tenant.');
    }

    if (updateData.name && updateData.name !== existing.name) {
        const nameExists = await prisma.tenant.count({ where: { name: updateData.name, id: { not: tenantId } } });
        if (nameExists > 0) throw new ApiError(httpStatus.CONFLICT, `Tenant name "${updateData.name}" already exists.`);
    }

    const dataToUpdate: Prisma.TenantUpdateInput = {};
    if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
    if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
    if (updateData.configuration !== undefined) {
        if (updateData.configuration === null) { dataToUpdate.configuration = Prisma.JsonNull; }
        else {
            try {
                if (typeof updateData.configuration === 'string') {
                    dataToUpdate.configuration = JSON.parse(updateData.configuration);
                } else { throw new Error("Configuration must be a valid JSON string or null."); }
            }
            catch (e: any) {
                logContext.error = e;
                logger.warn("Invalid JSON format for configuration during update.", logContext);
                throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for configuration.');
            }
        }
    }

    // Add new fields
    if (updateData.companyPhone !== undefined) dataToUpdate.companyPhone = updateData.companyPhone;
    if (updateData.website !== undefined) dataToUpdate.website = updateData.website;
    if (updateData.email !== undefined) dataToUpdate.email = updateData.email;
    if (updateData.companyAddress !== undefined) dataToUpdate.companyAddress = updateData.companyAddress;
    if (updateData.tin !== undefined) dataToUpdate.tin = updateData.tin;

    if (Object.keys(dataToUpdate).length === 0) {
        logger.info(`Tenant update skipped: No effective changes provided`, logContext);
        return existing;
    }

    try {
        const updatedTenant = await prisma.tenant.update({ where: { id: tenantId }, data: dataToUpdate });
        logger.info(`Tenant updated successfully`, { ...logContext, changes: dataToUpdate });
        // TODO: Trigger side effects if status changed to SUSPENDED
        return updatedTenant;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating tenant`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { throw new ApiError(httpStatus.CONFLICT, `Tenant name conflict during update.`); }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found during update attempt.'); }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update tenant.');
    }
};

/** Deactivate Tenant By ID (Super Admin - Soft Delete) */
const deactivateTenantById = async (tenantId: string, actionData?: TenantActionDto): Promise<Tenant> => {
    const logContext: LogContext = { function: 'deactivateTenantById', tenantId, data: actionData };

    const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) {
        logger.warn(`Deactivation failed: Tenant not found`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found.');
    }
    if (existing.status === TenantStatus.DEACTIVATED) {
        logger.info(`Tenant already deactivated`, logContext);
        return existing;
    }

    const dataToUpdate: Prisma.TenantUpdateInput = {
        status: TenantStatus.DEACTIVATED,
        deactivatedAt: new Date(),
    };
    if (actionData?.notes) {
        const currentConfig = (existing.configuration as Prisma.JsonObject) ?? {};
        dataToUpdate.configuration = { ...currentConfig, _deactivationInfo: { reason: actionData.notes, timestamp: new Date().toISOString(), /* maybe add byUserId? */ } };
    }

    try {
        // TODO: Consider transaction if deactivation side effects need atomicity
        const deactivatedTenant = await prisma.tenant.update({ where: { id: tenantId }, data: dataToUpdate });
        logger.info(`Tenant deactivated successfully`, logContext);
        // CRITICAL TODO: Trigger side effects for deactivation:
        // 1. Invalidate all sessions/refresh tokens for users of this tenant.
        // 2. Prevent future logins for users of this tenant (check tenant status in auth).
        // 3. Potentially kick off background jobs for data archival/anonymization based on policy.
        return deactivatedTenant;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error deactivating tenant`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found during deactivation attempt.');
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to deactivate tenant.');
    }
};


/** Update specific configuration for the *currently authenticated* tenant (Tenant Admin) */
const updateOwnTenantConfig = async (tenantId: string, configData: UpdateTenantConfigDto): Promise<Tenant> => {
    const logContext: LogContext = { function: 'updateOwnTenantConfig', tenantId, data: configData };

    const existingTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existingTenant) throw new ApiError(httpStatus.NOT_FOUND, 'Tenant context invalid.');

    if (existingTenant.status !== TenantStatus.ACTIVE && existingTenant.status !== TenantStatus.TRIAL) {
        throw new ApiError(httpStatus.FORBIDDEN, `Cannot update configuration for tenant with status ${existingTenant.status}.`);
    }

    const currentConfig = (existingTenant.configuration as Prisma.JsonObject) ?? {};
    let newConfig: Prisma.JsonObject = { ...currentConfig }; // Shallow copy

    // Merge strategy based on DTO structure
    if (configData.settings) {
        const currentSettings = (currentConfig.settings as Prisma.JsonObject) ?? {};
        newConfig.settings = { ...currentSettings, ...configData.settings }; // Overwrite/add keys in settings
    }
    // Add updates for other specific top-level keys defined in UpdateTenantConfigDto
    if (configData.currency) {
        newConfig.currency = configData.currency;
    }

    // Handle SMTP configuration
    if (configData.smtp !== undefined) {
        if (configData.smtp === null) {
            // User explicitly disabled SMTP - remove it from config
            delete newConfig.smtp;
        } else {
            // Merge SMTP config (don't overwrite password if not provided)
            const currentSmtp = (currentConfig.smtp as Record<string, any>) ?? {};
            const smtpData = configData.smtp as Record<string, any>;
            const newSmtp: Record<string, any> = { ...currentSmtp, ...smtpData };

            // Handle nested auth object
            if (smtpData.auth) {
                const currentAuth = (currentSmtp.auth as Record<string, any>) ?? {};
                newSmtp.auth = { ...currentAuth, ...smtpData.auth };

                // Only update password if provided (non-empty)
                if (!smtpData.auth.pass) {
                    newSmtp.auth.pass = currentAuth.pass || '';
                }
            }

            newConfig.smtp = newSmtp as Prisma.JsonValue;
        }
    }

    // Handle enabled notification channels
    if (configData.enabledChannels !== undefined) {
        newConfig.enabledChannels = configData.enabledChannels as Prisma.JsonValue;
    }

    // Handle alert settings (per-alert-type notification recipient configuration)
    if (configData.alertSettings !== undefined) {
        const currentAlertSettings = (currentConfig.alertSettings as Record<string, any>) ?? {};
        const incomingAlertSettings = configData.alertSettings as Record<string, any>;

        // Deep merge alert settings per alert type
        const mergedAlertSettings: Record<string, any> = { ...currentAlertSettings };
        for (const alertType of Object.keys(incomingAlertSettings)) {
            mergedAlertSettings[alertType] = {
                ...(currentAlertSettings[alertType] || {}),
                ...incomingAlertSettings[alertType],
            };
        }

        newConfig.alertSettings = mergedAlertSettings as Prisma.JsonValue;
    }

    // Avoid DB call if config hasn't actually changed (simple stringify compare)
    if (JSON.stringify(newConfig) === JSON.stringify(currentConfig)) {
        logger.info(`Tenant config update skipped: No effective changes`, logContext);
        return existingTenant;
    }

    try {
        const updatedTenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: { configuration: newConfig }
        });
        logger.info(`Own tenant configuration updated successfully`, logContext);
        // Invalidate tenant config cache if implemented
        return updatedTenant;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating own tenant configuration`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update tenant configuration.');
    }
};

const setTenantAdmins = async (tenantId: string, adminUserIds: string[]): Promise<UserRole[]> => {
    // Setup logging context
    const logContext: LogContext = { function: 'setTenantAdmins', tenantId, data: { adminUserIds } };
    logger.info(`Attempting to set administrators for tenant ${tenantId}`, logContext);

    // --- Input Validation ---
    if (!adminUserIds || !Array.isArray(adminUserIds) || adminUserIds.length === 0 || adminUserIds.length > 2) {
        logger.warn(`Set tenant admins failed: Invalid number of admin IDs provided (${adminUserIds?.length ?? 0}).`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, 'Must provide 1 or 2 user IDs to set as administrators.');
    }
    // Ensure unique IDs provided
    if (new Set(adminUserIds).size !== adminUserIds.length) {
        logger.warn(`Set tenant admins failed: Provided admin user IDs are not unique.`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, 'Provided admin user IDs must be unique.');
    }
    // Further ID format validation happens via DTO/controller ideally, but could add UUID check here if needed

    // --- Transactional Logic ---
    try {
        const newAdminAssignments = await prisma.$transaction(async (tx) => {
            // 1. Verify tenant exists
            const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
            if (!tenant) {
                logger.warn(`Set tenant admins failed: Tenant not found`, logContext);
                throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found.');
            }

            // 2. Verify the target users exist AND belong to THIS tenant
            const targetUsers = await tx.user.findMany({
                where: {
                    id: { in: adminUserIds },
                    tenantId: tenantId // CRITICAL: Ensure users belong to the target tenant
                },
                select: { id: true }
            });
            if (targetUsers.length !== adminUserIds.length) {
                const foundIds = targetUsers.map(u => u.id);
                const notFoundOrWrongTenantIds = adminUserIds.filter(id => !foundIds.includes(id));
                logContext.notFoundUserIds = notFoundOrWrongTenantIds;
                logger.warn(`Set tenant admins failed: Users not found or not part of tenant ${tenantId}`, logContext);
                throw new ApiError(httpStatus.BAD_REQUEST, `One or more specified users not found or do not belong to this tenant: ${notFoundOrWrongTenantIds.join(', ')}`);
            }

            // 3. Find the 'Admin' role ID specific to this tenant
            const adminRole = await tx.role.findUnique({
                where: { tenantId_name: { tenantId, name: TENANT_ADMIN_ROLE_NAME } }, // Use the unique constraint
                select: { id: true }
            });
            if (!adminRole) {
                // This indicates a setup problem for this tenant
                logger.error(`Default "${TENANT_ADMIN_ROLE_NAME}" role not found for tenant ${tenantId}. Tenant setup might be incomplete.`, logContext);
                throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Default admin role missing for this tenant. Cannot assign administrators.`);
            }
            logContext.adminRoleId = adminRole.id;

            // 4. Remove ALL existing Admin role assignments for users currently in THIS tenant
            // This ensures we only have the *new* set of admins.
            const deleteResult = await tx.userRole.deleteMany({
                where: {
                    roleId: adminRole.id,
                    // Ensure we only delete roles for users actually belonging to this tenant
                    // This is slightly redundant if roleId is tenant-scoped but adds robustness
                    user: { tenantId: tenantId }
                }
            });
            logger.debug(`Removed ${deleteResult.count} existing admin role assignments for tenant ${tenantId}`, logContext);

            // 5. Create new assignments for the specified users
            const assignmentsToCreate = adminUserIds.map(userId => ({
                userId: userId,
                roleId: adminRole.id
            }));

            if (assignmentsToCreate.length > 0) {
                await tx.userRole.createMany({
                    data: assignmentsToCreate,
                    skipDuplicates: true // Should not happen after deleteMany, but safety measure
                });
                logger.debug(`Created ${assignmentsToCreate.length} new admin role assignments`, logContext);
            } else {
                // This case should be caught by initial validation, but log if reached
                logger.warn(`No admin assignments to create (adminUserIds array was empty?)`, logContext);
            }

            // 6. Fetch the created assignments to return confirmation (optional step)
            const createdAssignments = await tx.userRole.findMany({
                where: { roleId: adminRole.id, userId: { in: adminUserIds } }
                // Optionally include user/role details if needed by caller
                // include: { user: { select: { id: true, email: true }}, role: { select: { id: true, name: true }} }
            });

            return createdAssignments; // Return the array of UserRole records created
        });

        logger.info(`Successfully set administrators for tenant ${tenantId} to users: ${adminUserIds.join(', ')}`, logContext);
        return newAdminAssignments; // Return the result of the transaction

    } catch (error: any) {
        // Handle known API errors thrown during validation
        if (error instanceof ApiError) {
            // Log with context but re-throw the original ApiError
            logContext.error = { message: error.message, statusCode: error.statusCode };
            logger.error(`Error setting tenant administrators: ${error.message}`, logContext);
            throw error;
        }

        // Handle potential Prisma unique constraint errors (e.g., on UserRole if deleteMany failed somehow)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            logContext.error = error;
            logger.error(`Error setting tenant administrators: Unique constraint violation`, logContext);
            throw new ApiError(httpStatus.CONFLICT, 'Failed to set administrators due to a data conflict. Please try again.');
        }

        // Handle other unexpected errors
        logContext.error = error;
        logger.error(`Unexpected error setting tenant administrators`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to set tenant administrators due to an internal error.');
    }
};

/** Sets/Replaces the administrators for a given tenant (Super Admin) */
// const setTenantAdmins = async (tenantId: string, adminUserIds: string[]): Promise<UserRole[]> => {
//      const logContext: LogContext = { function: 'setTenantAdmins', tenantId, data: { adminUserIds } };

//      if (!adminUserIds || adminUserIds.length === 0 || adminUserIds.length > 2) { throw new ApiError(httpStatus.BAD_REQUEST, 'Must provide 1 or 2 user IDs to set as administrators.'); }
//      if (new Set(adminUserIds).size !== adminUserIds.length) { throw new ApiError(httpStatus.BAD_REQUEST, 'Provided admin user IDs must be unique.'); }

//      try {
//         const newAdminAssignments = await prisma.$transaction(async (tx) => {
//             const tenantExists = await tx.tenant.count({ where: { id: tenantId } }); if (!tenantExists) throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found.');
//             const targetUsers = await tx.user.findMany({ where: { id: { in: adminUserIds }, tenantId: tenantId }, select: { id: true }}); if (targetUsers.length !== adminUserIds.length) { const foundIds = targetUsers.map(u => u.id); const notFoundIds = adminUserIds.filter(id => !foundIds.includes(id)); throw new ApiError(httpStatus.BAD_REQUEST, `One or more specified users not found or do not belong to this tenant: ${notFoundIds.join(', ')}`); }
//             const adminRole = await tx.role.findUnique({ where: { tenantId_name: { tenantId, name: TENANT_ADMIN_ROLE_NAME } }, select: { id: true } }); if (!adminRole) { logger.error(/*...*/); throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Default admin role missing for this tenant.`); }

//             // Remove ALL existing Admin role assignments for users of THIS tenant
//             await tx.userRole.deleteMany({ where: { roleId: adminRole.id, user: { tenantId: tenantId } } });
//             // Create new assignments for the specified users
//             const assignmentsToCreate = adminUserIds.map(userId => ({ userId: userId, roleId: adminRole.id }));
//             await tx.userRole.createMany({ data: assignmentsToCreate });
//             // Fetch the created assignments to return
//             const createdAssignments = await tx.userRole.findMany({ where: { roleId: adminRole.id, userId: { in: adminUserIds }} });
//             return createdAssignments;
//         });
//          logger.info(`Successfully set administrators for tenant ${tenantId} to users: ${adminUserIds.join(', ')}`, logContext);
//          return newAdminAssignments;
//      } catch (error: any) {
//          if (error instanceof ApiError) throw error;
//          logContext.error = error;
//          logger.error(`Error setting tenant administrators`, logContext);
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { throw new ApiError(httpStatus.CONFLICT, 'Failed to set administrators due to a data conflict (UserRole unique constraint).'); }
//          throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to set tenant administrators.');
//      }
// };


// Export all public service methods
export const tenantService = {
    createTenantWithDefaults,
    queryTenants,
    getTenantById,
    updateTenantById,       // Super Admin updates (inc. status like SUSPEND)
    deactivateTenantById,   // Super Admin soft delete
    updateOwnTenantConfig,  // Tenant Admin self-config updates
    setTenantAdmins,        // Super Admin set/replace admins
};
