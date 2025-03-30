// src/modules/suppliers/supplier.service.ts
import httpStatus from 'http-status';
import { Prisma, Supplier, PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
// import { CreateSupplierDto, UpdateSupplierDto } from './dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';


// Define log context type if not global
type LogContext = { function?: string; tenantId?: string | null; supplierId?: string | null; data?: any; error?: any; [key: string]: any; };

// Type for safe response (currently same as Supplier)
export type SafeSupplier = Omit<Supplier, ''>;

/**
 * Create a new supplier.
 */
const createSupplier = async (data: CreateSupplierDto, tenantId: string): Promise<SafeSupplier> => {
    const logContext: LogContext = { function: 'createSupplier', tenantId, name: data.name };

    // 1. Check if name is unique within the tenant
    const existing = await prisma.supplier.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
        select: { id: true }
    });
    if (existing) {
        logger.warn(`Supplier creation failed: Name already exists`, logContext);
        throw new ApiError(httpStatus.CONFLICT, `Supplier with name "${data.name}" already exists.`);
    }

    // 2. Prepare data
    let parsedCustomAttributes: Prisma.InputJsonValue | undefined = undefined;
    if (data.customAttributes) {
        try { parsedCustomAttributes = JSON.parse(data.customAttributes); }
        catch (e) { throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for customAttributes.'); }
    }
    const addressJson = data.address ? data.address as Prisma.JsonObject : undefined;

    // 3. Create in DB
    try {
        const supplier = await prisma.supplier.create({
            data: {
                tenantId,
                name: data.name,
                contactName: data.contactName,
                email: data.email?.toLowerCase(),
                phone: data.phone,
                address: addressJson ?? Prisma.JsonNull,
                paymentTerms: data.paymentTerms,
                customAttributes: parsedCustomAttributes ?? Prisma.JsonNull,
                isActive: true, // Default new suppliers to active
            },
        });
        logContext.supplierId = supplier.id;
        logger.info(`Supplier created successfully`, logContext);
        return supplier;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error creating supplier`, logContext);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             throw new ApiError(httpStatus.CONFLICT, `Supplier name conflict during creation.`);
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create supplier.');
    }
};

/**
 * Query for suppliers with pagination, filtering, and sorting.
 */
const querySuppliers = async (
    filter: Prisma.SupplierWhereInput,
    orderBy: Prisma.SupplierOrderByWithRelationInput[],
    limit: number,
    page: number
): Promise<{ suppliers: SafeSupplier[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'querySuppliers', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }

    try {
        const [suppliers, totalResults] = await prisma.$transaction([
            prisma.supplier.findMany({
                where: filter,
                orderBy,
                skip,
                take: limit,
                // Optionally include counts of related entities like POs
                // include: { _count: { select: { purchaseOrders: true } } }
            }),
            prisma.supplier.count({ where: filter }),
        ]);
        logger.debug(`Supplier query successful, found ${suppliers.length} of ${totalResults}`, logContext);
        return { suppliers, totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying suppliers`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve suppliers.');
    }
};

/**
 * Get supplier by ID, ensuring tenant isolation.
 */
const getSupplierById = async (supplierId: string, tenantId: string): Promise<SafeSupplier | null> => {
     const logContext: LogContext = { function: 'getSupplierById', supplierId, tenantId };
    try {
        const supplier = await prisma.supplier.findFirst({
            where: { id: supplierId, tenantId }
            // Optionally include related data:
            // include: { purchaseOrders: { take: 5, orderBy: { createdAt: 'desc' }} } // Example
        });
        if (!supplier) {
             logger.warn(`Supplier not found or tenant mismatch`, logContext);
             return null;
         }
        logger.debug(`Supplier found successfully`, logContext);
        return supplier;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching supplier by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve supplier.');
    }
};

/**
 * Update supplier details by ID.
 */
const updateSupplierById = async (
    supplierId: string,
    updateData: UpdateSupplierDto,
    tenantId: string
): Promise<SafeSupplier> => {
    const logContext: LogContext = { function: 'updateSupplierById', supplierId, tenantId, data: updateData };

    // 1. Verify exists in tenant
    const existing = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true }});
    if (!existing) {
         logger.warn(`Update failed: Supplier not found`, logContext);
         throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found.');
    }

    // 2. Check name uniqueness if changing name
    if (updateData.name && updateData.name !== existing.name) {
        const nameExists = await prisma.supplier.findFirst({ where: { name: updateData.name, tenantId, id: { not: supplierId } }, select: { id: true }});
        if (nameExists) {
            logger.warn(`Update failed: Name already exists`, logContext);
            throw new ApiError(httpStatus.CONFLICT, `Supplier with name "${updateData.name}" already exists.`);
        }
    }

    // 3. Prepare update payload
    const dataToUpdate: Prisma.SupplierUpdateInput = {};
    Object.keys(updateData).forEach((key) => {
        const typedKey = key as keyof UpdateSupplierDto;
         // Skip complex fields handled separately
        if (typedKey !== 'address' && typedKey !== 'customAttributes' && updateData[typedKey] !== undefined) {
            (dataToUpdate as any)[typedKey] = updateData[typedKey];
        }
    });
    // Handle email case-insensitivity if needed
    if (dataToUpdate.email) dataToUpdate.email = (dataToUpdate.email as string).toLowerCase();

    // Handle address update/clear
    if (updateData.address !== undefined) {
         dataToUpdate.address = updateData.address as Prisma.JsonObject ?? Prisma.JsonNull;
    }
    // Handle custom attributes update/clear
    if (updateData.customAttributes !== undefined) {
         if (updateData.customAttributes === null) {
             dataToUpdate.customAttributes = Prisma.JsonNull;
         } else {
             try {
                  if(typeof updateData.customAttributes === 'string') {
                     dataToUpdate.customAttributes = JSON.parse(updateData.customAttributes);
                  } else {
                      // Should not happen if DTO validation is correct
                       logger.warn("Received non-string customAttributes for update", logContext);
                       throw new Error("Invalid customAttributes format");
                  }
             } catch (e) {
                  logContext.error = e;
                  logger.warn(`Update failed: Invalid JSON for customAttributes`, logContext);
                 throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
             }
         }
    }

     if (Object.keys(dataToUpdate).length === 0) {
         logger.info(`Supplier update skipped: No changes provided`, logContext);
         const currentSupplier = await getSupplierById(supplierId, tenantId); // Re-fetch needed? existing only has id/name
         if (!currentSupplier) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found.');
         return currentSupplier;
     }

    // 4. Perform update
    try {
        const updatedSupplier = await prisma.supplier.update({
            where: { id: supplierId }, // Tenant verified above
            data: dataToUpdate,
        });
        logger.info(`Supplier updated successfully`, logContext);
        // Invalidate supplier cache if implemented
        return updatedSupplier;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating supplier`, logContext);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             throw new ApiError(httpStatus.CONFLICT, `Supplier name conflict during update.`);
         }
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found during update attempt.');
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update supplier.');
    }
};

/**
 * Soft delete (deactivate) a supplier by ID.
 */
const deleteSupplierById = async (supplierId: string, tenantId: string): Promise<SafeSupplier> => {
    const logContext: LogContext = { function: 'deleteSupplierById', supplierId, tenantId };

    // 1. Verify exists and is active
    const existing = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }});
    if (!existing) {
         logger.warn(`Deactivation failed: Supplier not found`, logContext);
         throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found.');
    }
    if (!existing.isActive) {
        logger.info(`Supplier already inactive`, logContext);
        return existing; // Return current state if already inactive
    }

    // 2. Dependency Check (Example: Check for non-completed/non-cancelled POs)
    const activePoCount = await prisma.purchaseOrder.count({
         where: {
             supplierId: supplierId,
             tenantId: tenantId,
             status: { notIn: [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.FULLY_RECEIVED] }
         }
     });

     if (activePoCount > 0) {
         logger.warn(`Deactivation failed: Supplier has active purchase orders`, { ...logContext, activePoCount });
         throw new ApiError(httpStatus.BAD_REQUEST, `Cannot deactivate supplier with ${activePoCount} active purchase order(s).`);
     }

    // 3. Perform update to deactivate
    try {
        const updatedSupplier = await prisma.supplier.update({
            where: { id: supplierId }, // Tenant verified above
            data: { isActive: false },
        });
        logger.info(`Supplier deactivated successfully`, logContext);
        // Invalidate cache if implemented
        return updatedSupplier;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error deactivating supplier`, logContext);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found during deactivation attempt.');
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to deactivate supplier.');
    }
};


export const supplierService = {
  createSupplier,
  querySuppliers,
  getSupplierById,
  updateSupplierById,
  deleteSupplierById, // Note: This performs a soft delete (deactivation)
};
