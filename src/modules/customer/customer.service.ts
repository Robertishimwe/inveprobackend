// src/modules/customers/customer.service.ts
import httpStatus from 'http-status';
import { Prisma, Customer, OrderStatus, CustomerGroup } from '@prisma/client'; // Import CustomerGroup
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type LogContext = { function?: string; tenantId?: string | null; customerId?: string | null; data?: any; error?: any;[key: string]: any; };

// Type for safe response (Customer model is already safe as it doesn't include sensitive data like passwords)
export type SafeCustomer = Customer & { customerGroup?: Pick<CustomerGroup, 'id' | 'name'> | null }; // Example including partial group

/** Create Customer */
const createCustomer = async (data: CreateCustomerDto, tenantId: string): Promise<SafeCustomer> => {
    const logContext: LogContext = { function: 'createCustomer', tenantId, email: data.email };
    const lowerCaseEmail = data.email?.toLowerCase();
    // ... (rest of implementation)


    // 1. Check email uniqueness (if email provided)
    if (lowerCaseEmail) {
        const existing = await prisma.customer.findFirst({ where: { email: lowerCaseEmail, tenantId }, select: { id: true } });
        if (existing) {
            logger.warn(`Customer creation failed: Email exists`, logContext);
            throw new ApiError(httpStatus.CONFLICT, `Customer with email "${data.email}" already exists.`);
        }
    } else {
        if (!data.firstName && !data.lastName && !data.phone && !data.companyName) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Customer must have at least an email, phone number, or name.');
        }
    }

    // 2. Validate customerGroupId
    if (data.customerGroupId) {
        const groupExists = await prisma.customerGroup.count({ where: { id: data.customerGroupId, tenantId } });
        if (!groupExists) {
            logger.warn(`Customer creation failed: Customer group not found`, { ...logContext, customerGroupId: data.customerGroupId });
            throw new ApiError(httpStatus.BAD_REQUEST, 'Customer group not found.');
        }
    }

    // 3. Prepare data
    let parsedCustomAttributes: Prisma.InputJsonValue | undefined = undefined;
    if (data.customAttributes) {
        try { parsedCustomAttributes = JSON.parse(data.customAttributes); }
        catch (e) { throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for customAttributes.'); }
    }
    const billingAddress = data.defaultBillingAddress ? data.defaultBillingAddress as Prisma.JsonObject : undefined;
    const shippingAddress = data.defaultShippingAddress ? data.defaultShippingAddress as Prisma.JsonObject : undefined;

    // 4. Create in DB
    try {
        const customer = await prisma.customer.create({
            data: {
                tenantId,
                email: lowerCaseEmail,
                firstName: data.firstName,
                lastName: data.lastName,
                companyName: data.companyName,
                phone: data.phone,
                customerGroupId: data.customerGroupId,
                defaultBillingAddress: billingAddress ?? Prisma.JsonNull,
                defaultShippingAddress: shippingAddress ?? Prisma.JsonNull,
                taxExempt: data.taxExempt,
                notes: data.notes,
                customAttributes: parsedCustomAttributes ?? Prisma.JsonNull,
                loyaltyPoints: data.loyaltyPoints,
            },
            include: { customerGroup: { select: { id: true, name: true } } } // Include group info in response
        });
        logContext.customerId = customer.id;
        logger.info(`Customer created successfully`, logContext);
        return customer as SafeCustomer; // Cast to safe type
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error creating customer`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { // Check if email has unique constraint
            throw new ApiError(httpStatus.CONFLICT, `Customer email conflict during creation.`);
        }
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable due to the throw in catch, fixing TS2366
};

/** Query Customers */
const queryCustomers = async (filter: Prisma.CustomerWhereInput, orderBy: Prisma.CustomerOrderByWithRelationInput[], limit: number, page: number): Promise<{ customers: SafeCustomer[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryCustomers', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }
    try {
        const [customers, totalResults] = await prisma.$transaction([
            prisma.customer.findMany({
                where: filter,
                include: { customerGroup: { select: { id: true, name: true } } }, // Include group name in list
                orderBy, skip, take: limit
            }),
            prisma.customer.count({ where: filter }),
        ]);
        logger.debug(`Customer query successful, found ${customers.length} of ${totalResults}`, logContext);
        return { customers: customers as SafeCustomer[], totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying customers`, logContext);
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve customers.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};

/** Get Customer By ID */
const getCustomerById = async (customerId: string, tenantId: string): Promise<SafeCustomer | null> => {
    const logContext: LogContext = { function: 'getCustomerById', customerId, tenantId };
    try {
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, tenantId },
            include: { customerGroup: true } // Include full group details
        });
        if (!customer) { logger.warn(`Customer not found or tenant mismatch`, logContext); return null; }
        logger.debug(`Customer found successfully`, logContext);
        return customer as SafeCustomer; // Cast needed if SafeCustomer has different includes
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching customer by ID`, logContext);
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};

/** Update Customer By ID */
const updateCustomerById = async (customerId: string, updateData: UpdateCustomerDto, tenantId: string): Promise<SafeCustomer> => {
    const logContext: LogContext = { function: 'updateCustomerById', customerId, tenantId, data: updateData };
    const existing = await getCustomerById(customerId, tenantId);
    if (!existing) { throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found.'); }

    // Prepare update payload
    const dataToUpdate: Prisma.CustomerUpdateInput = {};
    // Map simple fields from DTO
    Object.keys(updateData).forEach((key) => {
        const typedKey = key as keyof UpdateCustomerDto;
        // Exclude relation/JSON fields handled below
        if (typedKey !== 'customerGroupId' && typedKey !== 'defaultBillingAddress' && typedKey !== 'defaultShippingAddress' && typedKey !== 'customAttributes' && updateData[typedKey] !== undefined) {
            (dataToUpdate as any)[typedKey] = updateData[typedKey];
        }
    });

    // --- FIX: Remove email handling as it's not in UpdateCustomerDto ---
    // if (updateData.email) dataToUpdate.email = updateData.email.toLowerCase();
    // -----------------------------------------------------------------

    // Validate and handle customerGroupId update
    if (updateData.customerGroupId !== undefined) { // Check if key exists (allows setting to null)
        if (updateData.customerGroupId !== null) { // If setting to a group, validate it
            const groupExists = await prisma.customerGroup.count({ where: { id: updateData.customerGroupId, tenantId } });
            if (!groupExists) { throw new ApiError(httpStatus.BAD_REQUEST, 'Customer group not found.'); }
            dataToUpdate.customerGroup = { connect: { id: updateData.customerGroupId } };
        } else { // Setting to null
            dataToUpdate.customerGroup = { disconnect: true };
        }
    }

    // Handle address updates (allow clearing with null)
    if (updateData.defaultBillingAddress !== undefined) {
        dataToUpdate.defaultBillingAddress = updateData.defaultBillingAddress as Prisma.JsonObject ?? Prisma.JsonNull;
    }
    if (updateData.defaultShippingAddress !== undefined) {
        dataToUpdate.defaultShippingAddress = updateData.defaultShippingAddress as Prisma.JsonObject ?? Prisma.JsonNull;
    }

    // Handle custom attributes update/clear
    if (updateData.customAttributes !== undefined) {
        if (updateData.customAttributes === null) {
            dataToUpdate.customAttributes = Prisma.JsonNull;
        } else {
            try {
                if (typeof updateData.customAttributes === 'string') { dataToUpdate.customAttributes = JSON.parse(updateData.customAttributes); }
                else { throw new Error("Invalid customAttributes format"); }
            } catch (e) { throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for customAttributes.'); }
        }
    }

    if (Object.keys(dataToUpdate).length === 0) {
        logger.info(`Customer update skipped: No changes provided`, logContext);
        return existing; // Return existing data if no changes applied
    }

    // Perform update
    try {
        const updatedCustomer = await prisma.customer.update({
            where: { id: customerId }, // Tenant already verified by initial getCustomerById
            data: dataToUpdate,
            include: { customerGroup: { select: { id: true, name: true } } } // Include necessary fields for SafeCustomer
        });
        logger.info(`Customer updated successfully`, logContext);
        return updatedCustomer as SafeCustomer;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating customer`, logContext);
        // Add specific error checks (e.g., P2002 for unique constraints if any are applicable)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found during update attempt.');
        }
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};

/** Delete Customer By ID (Hard Delete after dependency check) */
const deleteCustomerById = async (customerId: string, tenantId: string): Promise<void> => {
    const logContext: LogContext = { function: 'deleteCustomerById', customerId, tenantId };
    const existing = await getCustomerById(customerId, tenantId);
    if (!existing) { throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found.'); }

    // Dependency Check: Check for non-completed/non-cancelled orders
    const openOrderCount = await prisma.order.count({
        where: {
            customerId: customerId,
            tenantId: tenantId,
            status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.RETURNED] }
        }
    });
    if (openOrderCount > 0) {
        logger.warn(`Delete failed: Customer has ${openOrderCount} open orders`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot delete customer with ${openOrderCount} open order(s).`);
    }

    // Perform actual deletion
    try {
        await prisma.customer.delete({ where: { id: customerId } }); // Tenant already verified
        logger.info(`Customer deleted successfully`, logContext);
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error deleting customer`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { // Foreign Key violation
            logger.warn(`Delete failed: Foreign key constraint violation (unexpected)`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete customer due to unexpected existing references.');
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found during delete attempt.');
        }
        // --- FIX: Ensure error is always thrown from catch block ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete customer.');
        // ----------------------------------------------------------
    }
    // This part is now unreachable
};



/**
 * Helper to find customer IDs where customAttributes (JSON) contains a search string.
 * This effectively casts JSON to text and searches it, which Prisma findMany doesn't support natively.
 */
const findIdsByCustomAttributeSearch = async (searchTerm: string, tenantId: string): Promise<string[]> => {
    try {
        // Use raw query to search in JSON column cast as text
        // Note: Table name 'customers' and column 'custom_attributes' must match DB schema
        const result = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM customers 
            WHERE tenant_id = ${tenantId} 
            AND custom_attributes::text ILIKE ${`%${searchTerm}%`}
        `;
        return result.map(r => r.id);
    } catch (error) {
        logger.error('Error in findIdsByCustomAttributeSearch', { error, searchTerm, tenantId });
        return []; // Return empty on error to not break the main search
    }
};

export const customerService = { createCustomer, queryCustomers, getCustomerById, updateCustomerById, deleteCustomerById, findIdsByCustomAttributeSearch };

