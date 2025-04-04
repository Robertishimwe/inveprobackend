"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerService = void 0;
// src/modules/customers/customer.service.ts
const http_status_1 = __importDefault(require("http-status"));
const client_1 = require("@prisma/client"); // Import CustomerGroup
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
/** Create Customer */
const createCustomer = async (data, tenantId) => {
    const logContext = { function: 'createCustomer', tenantId, email: data.email };
    const lowerCaseEmail = data.email?.toLowerCase();
    // 1. Check email uniqueness (if email provided)
    if (lowerCaseEmail) {
        const existing = await config_1.prisma.customer.findFirst({ where: { email: lowerCaseEmail, tenantId }, select: { id: true } });
        if (existing) {
            logger_1.default.warn(`Customer creation failed: Email exists`, logContext);
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Customer with email "${data.email}" already exists.`);
        }
    }
    else {
        if (!data.firstName && !data.lastName && !data.phone && !data.companyName) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Customer must have at least an email, phone number, or name.');
        }
    }
    // 2. Validate customerGroupId
    if (data.customerGroupId) {
        const groupExists = await config_1.prisma.customerGroup.count({ where: { id: data.customerGroupId, tenantId } });
        if (!groupExists) {
            logger_1.default.warn(`Customer creation failed: Customer group not found`, { ...logContext, customerGroupId: data.customerGroupId });
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Customer group not found.');
        }
    }
    // 3. Prepare data
    let parsedCustomAttributes = undefined;
    if (data.customAttributes) {
        try {
            parsedCustomAttributes = JSON.parse(data.customAttributes);
        }
        catch (e) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
        }
    }
    const billingAddress = data.defaultBillingAddress ? data.defaultBillingAddress : undefined;
    const shippingAddress = data.defaultShippingAddress ? data.defaultShippingAddress : undefined;
    // 4. Create in DB
    try {
        const customer = await config_1.prisma.customer.create({
            data: {
                tenantId,
                email: lowerCaseEmail,
                firstName: data.firstName,
                lastName: data.lastName,
                companyName: data.companyName,
                phone: data.phone,
                customerGroupId: data.customerGroupId,
                defaultBillingAddress: billingAddress ?? client_1.Prisma.JsonNull,
                defaultShippingAddress: shippingAddress ?? client_1.Prisma.JsonNull,
                taxExempt: data.taxExempt,
                notes: data.notes,
                customAttributes: parsedCustomAttributes ?? client_1.Prisma.JsonNull,
                loyaltyPoints: data.loyaltyPoints,
            },
            include: { customerGroup: { select: { id: true, name: true } } } // Include group info in response
        });
        logContext.customerId = customer.id;
        logger_1.default.info(`Customer created successfully`, logContext);
        return customer; // Cast to safe type
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating customer`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { // Check if email has unique constraint
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Customer email conflict during creation.`);
        }
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to create customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable due to the throw in catch, fixing TS2366
};
/** Query Customers */
const queryCustomers = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext = { function: 'queryCustomers', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant context missing.');
    }
    try {
        const [customers, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.customer.findMany({
                where: filter,
                include: { customerGroup: { select: { id: true, name: true } } }, // Include group name in list
                orderBy, skip, take: limit
            }),
            config_1.prisma.customer.count({ where: filter }),
        ]);
        logger_1.default.debug(`Customer query successful, found ${customers.length} of ${totalResults}`, logContext);
        return { customers: customers, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying customers`, logContext);
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve customers.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};
/** Get Customer By ID */
const getCustomerById = async (customerId, tenantId) => {
    const logContext = { function: 'getCustomerById', customerId, tenantId };
    try {
        const customer = await config_1.prisma.customer.findFirst({
            where: { id: customerId, tenantId },
            include: { customerGroup: true } // Include full group details
        });
        if (!customer) {
            logger_1.default.warn(`Customer not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Customer found successfully`, logContext);
        return customer; // Cast needed if SafeCustomer has different includes
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching customer by ID`, logContext);
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};
/** Update Customer By ID */
const updateCustomerById = async (customerId, updateData, tenantId) => {
    const logContext = { function: 'updateCustomerById', customerId, tenantId, data: updateData };
    const existing = await getCustomerById(customerId, tenantId);
    if (!existing) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer not found.');
    }
    // Prepare update payload
    const dataToUpdate = {};
    // Map simple fields from DTO
    Object.keys(updateData).forEach((key) => {
        const typedKey = key;
        // Exclude relation/JSON fields handled below
        if (typedKey !== 'customerGroupId' && typedKey !== 'defaultBillingAddress' && typedKey !== 'defaultShippingAddress' && typedKey !== 'customAttributes' && updateData[typedKey] !== undefined) {
            dataToUpdate[typedKey] = updateData[typedKey];
        }
    });
    // --- FIX: Remove email handling as it's not in UpdateCustomerDto ---
    // if (updateData.email) dataToUpdate.email = updateData.email.toLowerCase();
    // -----------------------------------------------------------------
    // Validate and handle customerGroupId update
    if (updateData.customerGroupId !== undefined) { // Check if key exists (allows setting to null)
        if (updateData.customerGroupId !== null) { // If setting to a group, validate it
            const groupExists = await config_1.prisma.customerGroup.count({ where: { id: updateData.customerGroupId, tenantId } });
            if (!groupExists) {
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Customer group not found.');
            }
            dataToUpdate.customerGroup = { connect: { id: updateData.customerGroupId } };
        }
        else { // Setting to null
            dataToUpdate.customerGroup = { disconnect: true };
        }
    }
    // Handle address updates (allow clearing with null)
    if (updateData.defaultBillingAddress !== undefined) {
        dataToUpdate.defaultBillingAddress = updateData.defaultBillingAddress ?? client_1.Prisma.JsonNull;
    }
    if (updateData.defaultShippingAddress !== undefined) {
        dataToUpdate.defaultShippingAddress = updateData.defaultShippingAddress ?? client_1.Prisma.JsonNull;
    }
    // Handle custom attributes update/clear
    if (updateData.customAttributes !== undefined) {
        if (updateData.customAttributes === null) {
            dataToUpdate.customAttributes = client_1.Prisma.JsonNull;
        }
        else {
            try {
                if (typeof updateData.customAttributes === 'string') {
                    dataToUpdate.customAttributes = JSON.parse(updateData.customAttributes);
                }
                else {
                    throw new Error("Invalid customAttributes format");
                }
            }
            catch (e) {
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
            }
        }
    }
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Customer update skipped: No changes provided`, logContext);
        return existing; // Return existing data if no changes applied
    }
    // Perform update
    try {
        const updatedCustomer = await config_1.prisma.customer.update({
            where: { id: customerId }, // Tenant already verified by initial getCustomerById
            data: dataToUpdate,
            include: { customerGroup: { select: { id: true, name: true } } } // Include necessary fields for SafeCustomer
        });
        logger_1.default.info(`Customer updated successfully`, logContext);
        return updatedCustomer;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating customer`, logContext);
        // Add specific error checks (e.g., P2002 for unique constraints if any are applicable)
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer not found during update attempt.');
        }
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};
/** Delete Customer By ID (Hard Delete after dependency check) */
const deleteCustomerById = async (customerId, tenantId) => {
    const logContext = { function: 'deleteCustomerById', customerId, tenantId };
    const existing = await getCustomerById(customerId, tenantId);
    if (!existing) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer not found.');
    }
    // Dependency Check: Check for non-completed/non-cancelled orders
    const openOrderCount = await config_1.prisma.order.count({
        where: {
            customerId: customerId,
            tenantId: tenantId,
            status: { notIn: [client_1.OrderStatus.COMPLETED, client_1.OrderStatus.CANCELLED, client_1.OrderStatus.RETURNED] }
        }
    });
    if (openOrderCount > 0) {
        logger_1.default.warn(`Delete failed: Customer has ${openOrderCount} open orders`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot delete customer with ${openOrderCount} open order(s).`);
    }
    // Perform actual deletion
    try {
        await config_1.prisma.customer.delete({ where: { id: customerId } }); // Tenant already verified
        logger_1.default.info(`Customer deleted successfully`, logContext);
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error deleting customer`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { // Foreign Key violation
            logger_1.default.warn(`Delete failed: Foreign key constraint violation (unexpected)`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Cannot delete customer due to unexpected existing references.');
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer not found during delete attempt.');
        }
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to delete customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};
exports.customerService = { createCustomer, queryCustomers, getCustomerById, updateCustomerById, deleteCustomerById };
//# sourceMappingURL=customer.service.js.map