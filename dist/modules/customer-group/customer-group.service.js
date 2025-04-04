"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerGroupService = void 0;
// src/modules/customer-groups/customer-group.service.ts
const http_status_1 = __importDefault(require("http-status"));
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
/**
 * Create a new customer group.
 * @param {CreateCustomerGroupDto} data - Data for the new group.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<CustomerGroup>} The created customer group.
 */
const createGroup = async (data, tenantId) => {
    const logContext = { function: 'createGroup', tenantId, name: data.name };
    // Check if name is unique within the tenant
    const existing = await config_1.prisma.customerGroup.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
        select: { id: true }
    });
    if (existing) {
        logger_1.default.warn(`Customer group creation failed: Name exists`, logContext);
        throw new ApiError_1.default(http_status_1.default.CONFLICT, `Customer group with name "${data.name}" already exists.`);
    }
    try {
        const group = await config_1.prisma.customerGroup.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
            },
        });
        logContext.groupId = group.id;
        logger_1.default.info(`Customer group created successfully`, logContext);
        return group;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating customer group`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Customer group name conflict during creation.`);
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to create customer group.');
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
const queryGroups = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext = { function: 'queryGroups', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant context missing.');
    }
    try {
        const [groups, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.customerGroup.findMany({
                where: filter,
                include: { _count: { select: { customers: true } } }, // Include customer count
                orderBy,
                skip,
                take: limit
            }),
            config_1.prisma.customerGroup.count({ where: filter }),
        ]);
        logger_1.default.debug(`Customer group query successful, found ${groups.length} of ${totalResults}`, logContext);
        return { groups: groups, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying customer groups`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve customer groups.');
    }
};
/**
 * Get a customer group by ID, ensuring tenant isolation.
 * @param {string} groupId - The ID of the group.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<CustomerGroupWithCount | null>} The group object or null if not found.
 */
const getGroupById = async (groupId, tenantId) => {
    const logContext = { function: 'getGroupById', groupId, tenantId };
    try {
        const group = await config_1.prisma.customerGroup.findFirst({
            where: { id: groupId, tenantId },
            include: { _count: { select: { customers: true } } } // Include customer count
        });
        if (!group) {
            logger_1.default.warn(`Customer group not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Customer group found successfully`, logContext);
        return group;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching customer group by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve customer group.');
    }
};
/**
 * Update a customer group by ID.
 * @param {string} groupId - The ID of the group to update.
 * @param {UpdateCustomerGroupDto} updateData - Data to update.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<CustomerGroup>} The updated customer group.
 */
const updateGroupById = async (groupId, updateData, tenantId) => {
    const logContext = { function: 'updateGroupById', groupId, tenantId, data: updateData };
    // 1. Verify group exists
    const existing = await getGroupById(groupId, tenantId);
    if (!existing) {
        logger_1.default.warn(`Update failed: Customer group not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer group not found.');
    }
    // 2. Check name uniqueness if changing name
    if (updateData.name && updateData.name !== existing.name) {
        const nameExists = await config_1.prisma.customerGroup.findFirst({
            where: { name: updateData.name, tenantId, id: { not: groupId } },
            select: { id: true }
        });
        if (nameExists) {
            logger_1.default.warn(`Update failed: Name already exists`, logContext);
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Customer group name "${updateData.name}" already exists.`);
        }
    }
    // 3. Prepare update payload
    const dataToUpdate = {};
    if (updateData.name !== undefined)
        dataToUpdate.name = updateData.name;
    if (updateData.description !== undefined)
        dataToUpdate.description = updateData.description;
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Customer group update skipped: No changes provided`, logContext);
        return existing; // Return existing data if no changes
    }
    // 4. Perform update
    try {
        const updatedGroup = await config_1.prisma.customerGroup.update({
            where: { id: groupId }, // Tenant verified by initial getGroupById
            data: dataToUpdate,
        });
        logger_1.default.info(`Customer group updated successfully`, logContext);
        // Invalidate cache if implemented
        return updatedGroup;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating customer group`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Customer group name conflict during update.`);
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer group not found during update attempt.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update customer group.');
    }
};
/**
 * Delete a customer group by ID after checking dependencies.
 * @param {string} groupId - The ID of the group to delete.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<void>}
 */
const deleteGroupById = async (groupId, tenantId) => {
    const logContext = { function: 'deleteGroupById', groupId, tenantId };
    // 1. Verify group exists
    const existing = await getGroupById(groupId, tenantId);
    if (!existing) {
        logger_1.default.warn(`Delete failed: Customer group not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer group not found.');
    }
    // 2. Check for associated customers
    const customerCount = await config_1.prisma.customer.count({
        where: { customerGroupId: groupId, tenantId }
    });
    if (customerCount > 0) {
        logger_1.default.warn(`Delete failed: Group has ${customerCount} customers associated`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot delete group with ${customerCount} associated customer(s). Reassign customers first.`);
    }
    // Add other dependency checks if groups are used elsewhere (e.g., pricing rules)
    // 3. Perform delete
    try {
        await config_1.prisma.customerGroup.delete({
            where: { id: groupId } // Tenant verified above
        });
        logger_1.default.info(`Customer group deleted successfully`, logContext);
        // Invalidate cache if implemented
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error deleting customer group`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { // Foreign Key constraint
            logger_1.default.warn(`Delete failed: Foreign key constraint violation`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Cannot delete group due to existing references.');
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer group not found during delete attempt.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to delete customer group.');
    }
};
exports.customerGroupService = {
    createGroup,
    queryGroups,
    getGroupById,
    updateGroupById,
    deleteGroupById,
};
//# sourceMappingURL=customer-group.service.js.map