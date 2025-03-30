// src/modules/customer-groups/customer-group.service.ts
import httpStatus from 'http-status';
import { Prisma, CustomerGroup } from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto';
import { UpdateCustomerGroupDto } from './dto/update-customer-group.dto';

// Define log context type if not global
type LogContext = { function?: string; tenantId?: string | null; groupId?: string | null; data?: any; error?: any; [key: string]: any; };

// Type for group response including customer count
export type CustomerGroupWithCount = CustomerGroup & { _count?: { customers: number } | null };

/**
 * Create a new customer group.
 * @param {CreateCustomerGroupDto} data - Data for the new group.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<CustomerGroup>} The created customer group.
 */
const createGroup = async (data: CreateCustomerGroupDto, tenantId: string): Promise<CustomerGroup> => {
    const logContext: LogContext = { function: 'createGroup', tenantId, name: data.name };

    // Check if name is unique within the tenant
    const existing = await prisma.customerGroup.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
        select: { id: true }
    });
    if (existing) {
        logger.warn(`Customer group creation failed: Name exists`, logContext);
        throw new ApiError(httpStatus.CONFLICT, `Customer group with name "${data.name}" already exists.`);
    }

    try {
        const group = await prisma.customerGroup.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
            },
        });
        logContext.groupId = group.id;
        logger.info(`Customer group created successfully`, logContext);
        return group;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error creating customer group`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError(httpStatus.CONFLICT, `Customer group name conflict during creation.`);
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create customer group.');
    }
};

/**
 * Query customer groups with pagination, filtering, and sorting.
 * @param {Prisma.CustomerGroupWhereInput} filter - Prisma filter object (must include tenantId).
 * @param {Prisma.CustomerGroupOrderByWithRelationInput[]} orderBy - Prisma sorting object array.
 * @param {number} limit - Max records per page.
 * @param {number} page - Current page number.
 * @returns {Promise<{ groups: CustomerGroupWithCount[], totalResults: number }>} List of groups and total count.
 */
const queryGroups = async (
    filter: Prisma.CustomerGroupWhereInput,
    orderBy: Prisma.CustomerGroupOrderByWithRelationInput[],
    limit: number,
    page: number
): Promise<{ groups: CustomerGroupWithCount[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryGroups', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }

    try {
        const [groups, totalResults] = await prisma.$transaction([
            prisma.customerGroup.findMany({
                where: filter,
                include: { _count: { select: { customers: true }} }, // Include customer count
                orderBy,
                skip,
                take: limit
            }),
            prisma.customerGroup.count({ where: filter }),
        ]);
        logger.debug(`Customer group query successful, found ${groups.length} of ${totalResults}`, logContext);
        return { groups: groups as CustomerGroupWithCount[], totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying customer groups`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve customer groups.');
    }
};

/**
 * Get a customer group by ID, ensuring tenant isolation.
 * @param {string} groupId - The ID of the group.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<CustomerGroupWithCount | null>} The group object or null if not found.
 */
const getGroupById = async (groupId: string, tenantId: string): Promise<CustomerGroupWithCount | null> => {
    const logContext: LogContext = { function: 'getGroupById', groupId, tenantId };
    try {
        const group = await prisma.customerGroup.findFirst({
            where: { id: groupId, tenantId },
            include: { _count: { select: { customers: true }}} // Include customer count
        });
        if (!group) {
             logger.warn(`Customer group not found or tenant mismatch`, logContext);
             return null;
        }
        logger.debug(`Customer group found successfully`, logContext);
        return group as CustomerGroupWithCount;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching customer group by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve customer group.');
    }
};

/**
 * Update a customer group by ID.
 * @param {string} groupId - The ID of the group to update.
 * @param {UpdateCustomerGroupDto} updateData - Data to update.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<CustomerGroup>} The updated customer group.
 */
const updateGroupById = async (groupId: string, updateData: UpdateCustomerGroupDto, tenantId: string): Promise<CustomerGroup> => {
    const logContext: LogContext = { function: 'updateGroupById', groupId, tenantId, data: updateData };

    // 1. Verify group exists
    const existing = await getGroupById(groupId, tenantId);
    if (!existing) {
        logger.warn(`Update failed: Customer group not found`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Customer group not found.');
    }

    // 2. Check name uniqueness if changing name
    if (updateData.name && updateData.name !== existing.name) {
        const nameExists = await prisma.customerGroup.findFirst({
            where: { name: updateData.name, tenantId, id: { not: groupId } },
            select: { id: true }
        });
        if (nameExists) {
            logger.warn(`Update failed: Name already exists`, logContext);
            throw new ApiError(httpStatus.CONFLICT, `Customer group name "${updateData.name}" already exists.`);
        }
    }

    // 3. Prepare update payload
    const dataToUpdate: Prisma.CustomerGroupUpdateInput = {};
    if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
    if (updateData.description !== undefined) dataToUpdate.description = updateData.description;


    if (Object.keys(dataToUpdate).length === 0) {
         logger.info(`Customer group update skipped: No changes provided`, logContext);
         return existing; // Return existing data if no changes
    }

    // 4. Perform update
    try {
        const updatedGroup = await prisma.customerGroup.update({
            where: { id: groupId }, // Tenant verified by initial getGroupById
            data: dataToUpdate,
        });
        logger.info(`Customer group updated successfully`, logContext);
        // Invalidate cache if implemented
        return updatedGroup;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating customer group`, logContext);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             throw new ApiError(httpStatus.CONFLICT, `Customer group name conflict during update.`);
         }
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new ApiError(httpStatus.NOT_FOUND, 'Customer group not found during update attempt.');
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update customer group.');
    }
};

/**
 * Delete a customer group by ID after checking dependencies.
 * @param {string} groupId - The ID of the group to delete.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<void>}
 */
const deleteGroupById = async (groupId: string, tenantId: string): Promise<void> => {
    const logContext: LogContext = { function: 'deleteGroupById', groupId, tenantId };

    // 1. Verify group exists
    const existing = await getGroupById(groupId, tenantId);
    if (!existing) {
        logger.warn(`Delete failed: Customer group not found`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Customer group not found.');
    }

    // 2. Check for associated customers
    const customerCount = await prisma.customer.count({
        where: { customerGroupId: groupId, tenantId }
    });
    if (customerCount > 0) {
        logger.warn(`Delete failed: Group has ${customerCount} customers associated`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot delete group with ${customerCount} associated customer(s). Reassign customers first.`);
    }
    // Add other dependency checks if groups are used elsewhere (e.g., pricing rules)

    // 3. Perform delete
    try {
        await prisma.customerGroup.delete({
            where: { id: groupId } // Tenant verified above
        });
        logger.info(`Customer group deleted successfully`, logContext);
        // Invalidate cache if implemented
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error deleting customer group`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { // Foreign Key constraint
             logger.warn(`Delete failed: Foreign key constraint violation`, logContext);
             throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete group due to existing references.');
         }
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new ApiError(httpStatus.NOT_FOUND, 'Customer group not found during delete attempt.');
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete customer group.');
    }
};

export const customerGroupService = {
    createGroup,
    queryGroups,
    getGroupById,
    updateGroupById,
    deleteGroupById,
};
