"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplierService = void 0;
// src/modules/suppliers/supplier.service.ts
const http_status_1 = __importDefault(require("http-status"));
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
/**
 * Create a new supplier.
 */
const createSupplier = async (data, tenantId) => {
    const logContext = { function: 'createSupplier', tenantId, name: data.name };
    // 1. Check if name is unique within the tenant
    const existing = await config_1.prisma.supplier.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
        select: { id: true }
    });
    if (existing) {
        logger_1.default.warn(`Supplier creation failed: Name already exists`, logContext);
        throw new ApiError_1.default(http_status_1.default.CONFLICT, `Supplier with name "${data.name}" already exists.`);
    }
    // 2. Prepare data
    let parsedCustomAttributes = undefined;
    if (data.customAttributes) {
        try {
            parsedCustomAttributes = JSON.parse(data.customAttributes);
        }
        catch (e) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
        }
    }
    const addressJson = data.address ? data.address : undefined;
    // 3. Create in DB
    try {
        const supplier = await config_1.prisma.supplier.create({
            data: {
                tenantId,
                name: data.name,
                contactName: data.contactName,
                email: data.email?.toLowerCase(),
                phone: data.phone,
                address: addressJson ?? client_1.Prisma.JsonNull,
                paymentTerms: data.paymentTerms,
                customAttributes: parsedCustomAttributes ?? client_1.Prisma.JsonNull,
                isActive: true, // Default new suppliers to active
            },
        });
        logContext.supplierId = supplier.id;
        logger_1.default.info(`Supplier created successfully`, logContext);
        return supplier;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating supplier`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Supplier name conflict during creation.`);
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to create supplier.');
    }
};
/**
 * Query for suppliers with pagination, filtering, and sorting.
 */
const querySuppliers = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext = { function: 'querySuppliers', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant context missing.');
    }
    try {
        const [suppliers, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.supplier.findMany({
                where: filter,
                orderBy,
                skip,
                take: limit,
                // Optionally include counts of related entities like POs
                // include: { _count: { select: { purchaseOrders: true } } }
            }),
            config_1.prisma.supplier.count({ where: filter }),
        ]);
        logger_1.default.debug(`Supplier query successful, found ${suppliers.length} of ${totalResults}`, logContext);
        return { suppliers, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying suppliers`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve suppliers.');
    }
};
/**
 * Get supplier by ID, ensuring tenant isolation.
 */
const getSupplierById = async (supplierId, tenantId) => {
    const logContext = { function: 'getSupplierById', supplierId, tenantId };
    try {
        const supplier = await config_1.prisma.supplier.findFirst({
            where: { id: supplierId, tenantId }
            // Optionally include related data:
            // include: { purchaseOrders: { take: 5, orderBy: { createdAt: 'desc' }} } // Example
        });
        if (!supplier) {
            logger_1.default.warn(`Supplier not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Supplier found successfully`, logContext);
        return supplier;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching supplier by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve supplier.');
    }
};
/**
 * Update supplier details by ID.
 */
const updateSupplierById = async (supplierId, updateData, tenantId) => {
    const logContext = { function: 'updateSupplierById', supplierId, tenantId, data: updateData };
    // 1. Verify exists in tenant
    const existing = await config_1.prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true } });
    if (!existing) {
        logger_1.default.warn(`Update failed: Supplier not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Supplier not found.');
    }
    // 2. Check name uniqueness if changing name
    if (updateData.name && updateData.name !== existing.name) {
        const nameExists = await config_1.prisma.supplier.findFirst({ where: { name: updateData.name, tenantId, id: { not: supplierId } }, select: { id: true } });
        if (nameExists) {
            logger_1.default.warn(`Update failed: Name already exists`, logContext);
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Supplier with name "${updateData.name}" already exists.`);
        }
    }
    // 3. Prepare update payload
    const dataToUpdate = {};
    Object.keys(updateData).forEach((key) => {
        const typedKey = key;
        // Skip complex fields handled separately
        if (typedKey !== 'address' && typedKey !== 'customAttributes' && updateData[typedKey] !== undefined) {
            dataToUpdate[typedKey] = updateData[typedKey];
        }
    });
    // Handle email case-insensitivity if needed
    if (dataToUpdate.email)
        dataToUpdate.email = dataToUpdate.email.toLowerCase();
    // Handle address update/clear
    if (updateData.address !== undefined) {
        dataToUpdate.address = updateData.address ?? client_1.Prisma.JsonNull;
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
                    // Should not happen if DTO validation is correct
                    logger_1.default.warn("Received non-string customAttributes for update", logContext);
                    throw new Error("Invalid customAttributes format");
                }
            }
            catch (e) {
                logContext.error = e;
                logger_1.default.warn(`Update failed: Invalid JSON for customAttributes`, logContext);
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
            }
        }
    }
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Supplier update skipped: No changes provided`, logContext);
        const currentSupplier = await getSupplierById(supplierId, tenantId); // Re-fetch needed? existing only has id/name
        if (!currentSupplier)
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Supplier not found.');
        return currentSupplier;
    }
    // 4. Perform update
    try {
        const updatedSupplier = await config_1.prisma.supplier.update({
            where: { id: supplierId }, // Tenant verified above
            data: dataToUpdate,
        });
        logger_1.default.info(`Supplier updated successfully`, logContext);
        // Invalidate supplier cache if implemented
        return updatedSupplier;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating supplier`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Supplier name conflict during update.`);
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Supplier not found during update attempt.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update supplier.');
    }
};
/**
 * Soft delete (deactivate) a supplier by ID.
 */
const deleteSupplierById = async (supplierId, tenantId) => {
    const logContext = { function: 'deleteSupplierById', supplierId, tenantId };
    // 1. Verify exists and is active
    const existing = await config_1.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!existing) {
        logger_1.default.warn(`Deactivation failed: Supplier not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Supplier not found.');
    }
    if (!existing.isActive) {
        logger_1.default.info(`Supplier already inactive`, logContext);
        return existing; // Return current state if already inactive
    }
    // 2. Dependency Check (Example: Check for non-completed/non-cancelled POs)
    const activePoCount = await config_1.prisma.purchaseOrder.count({
        where: {
            supplierId: supplierId,
            tenantId: tenantId,
            status: { notIn: [client_1.PurchaseOrderStatus.CANCELLED, client_1.PurchaseOrderStatus.FULLY_RECEIVED] }
        }
    });
    if (activePoCount > 0) {
        logger_1.default.warn(`Deactivation failed: Supplier has active purchase orders`, { ...logContext, activePoCount });
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot deactivate supplier with ${activePoCount} active purchase order(s).`);
    }
    // 3. Perform update to deactivate
    try {
        const updatedSupplier = await config_1.prisma.supplier.update({
            where: { id: supplierId }, // Tenant verified above
            data: { isActive: false },
        });
        logger_1.default.info(`Supplier deactivated successfully`, logContext);
        // Invalidate cache if implemented
        return updatedSupplier;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error deactivating supplier`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Supplier not found during deactivation attempt.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to deactivate supplier.');
    }
};
exports.supplierService = {
    createSupplier,
    querySuppliers,
    getSupplierById,
    updateSupplierById,
    deleteSupplierById, // Note: This performs a soft delete (deactivation)
};
//# sourceMappingURL=supplier.service.js.map