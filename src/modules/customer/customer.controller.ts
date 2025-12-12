// src/modules/customers/customer.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { customerService } from './customer.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // For filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
import { Prisma } from '@prisma/client'; // Import Prisma types for filtering/sorting

/**
 * Controller to handle customer creation.
 */
const createCustomer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req); // Ensures tenantId is present from auth context
    // Request body is validated against CreateCustomerDto by middleware
    const customer = await customerService.createCustomer(req.body, tenantId);
    res.status(httpStatus.CREATED).send(customer);
});

/**
 * Controller to handle querying multiple customers with filters and pagination.
 */
const getCustomers = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);

    // Define allowed filters from query parameters
    const filterParams = pick(req.query, [
        'firstName',    // Filter by first name (contains)
        'lastName',     // Filter by last name (contains)
        'name',         // Filter by combined first/last name (contains)
        'email',        // Filter by email (contains)
        'phone',        // Filter by phone number (contains)
        'companyName',  // Filter by company name (contains)
        'customerGroupId',// Filter by specific customer group ID
        'taxExempt',    // Filter by tax-exempt status ('true' or 'false')
        'search',       // Unified search across all text fields
        // Add isActive filter if you add that field to the Customer model
    ]);
    // Define allowed options for sorting and pagination
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object, always including the tenantId
    const filter: Prisma.CustomerWhereInput = { tenantId }; // Automatically scope by tenant

    // Unified search - searches across multiple fields
    if (filterParams.search) {
        const searchTerm = filterParams.search as string;
        filter.OR = [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
            { companyName: { contains: searchTerm, mode: 'insensitive' } },
            { companyName: { contains: searchTerm, mode: 'insensitive' } },
        ];

        // Fix for searching in customAttributes JSONB column
        // We find IDs that match the search term in customAttributes and add them to the OR condition
        const customAttrMatches = await customerService.findIdsByCustomAttributeSearch(searchTerm, tenantId);
        if (customAttrMatches.length > 0) {
            filter.OR.push({ id: { in: customAttrMatches } });
        }
    } else {
        // Individual field filters (only apply if unified search is not used)
        if (filterParams.firstName) filter.firstName = { contains: filterParams.firstName as string, mode: 'insensitive' };
        if (filterParams.lastName) filter.lastName = { contains: filterParams.lastName as string, mode: 'insensitive' };
        if (filterParams.email) filter.email = { contains: filterParams.email as string, mode: 'insensitive' };
        if (filterParams.phone) filter.phone = { contains: filterParams.phone as string };
        if (filterParams.companyName) filter.companyName = { contains: filterParams.companyName as string, mode: 'insensitive' };

        // Combined name search (example - searching first OR last name)
        if (filterParams.name) {
            const name = filterParams.name as string;
            filter.OR = [
                { firstName: { contains: name, mode: 'insensitive' } },
                { lastName: { contains: name, mode: 'insensitive' } },
            ];
        }
    }

    if (filterParams.customerGroupId) filter.customerGroupId = filterParams.customerGroupId as string;
    if (filterParams.taxExempt !== undefined) filter.taxExempt = filterParams.taxExempt === 'true';

    // Build Prisma OrderBy array
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for Customer model
                if (['email', 'firstName', 'lastName', 'companyName', 'createdAt', 'updatedAt', 'loyaltyPoints'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                // Example sorting by related field name
                // else if (key === 'groupName') { orderBy.push({ customerGroup: { name: order } }); }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ lastName: 'asc' }, { firstName: 'asc' }); // Default sort by name
    }

    // Parse pagination options
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call the service with constructed filters and options
    const result = await customerService.queryCustomers(filter, orderBy, limit, page);

    // Format and send the paginated response
    res.status(httpStatus.OK).send({
        results: result.customers,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});

/**
 * Controller to handle fetching a single customer by ID.
 */
const getCustomer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const customerId = req.params.customerId; // Customer ID from URL parameter

    // Optional: Permission checks (e.g., only specific roles can view customer details)
    // Middleware `checkPermissions(['customer:read'])` handles basic check

    const customer = await customerService.getCustomerById(customerId, tenantId);
    if (!customer) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
    }
    res.status(httpStatus.OK).send(customer);
});

/**
 * Controller to handle updating a customer by ID.
 */
const updateCustomer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const customerId = req.params.customerId;
    // req.body is validated UpdateCustomerDto by middleware

    // Optional: Permission checks (e.g., roles needed to update customer info)
    // Middleware `checkPermissions(['customer:update'])` handles basic check

    const customer = await customerService.updateCustomerById(customerId, req.body, tenantId);
    res.status(httpStatus.OK).send(customer);
});

/**
 * Controller to handle deleting (or deactivating) a customer by ID.
 */
const deleteCustomer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const customerId = req.params.customerId;

    // Optional: Permission checks
    // Middleware `checkPermissions(['customer:delete'])` handles basic check

    // Service layer performs dependency checks before deletion
    await customerService.deleteCustomerById(customerId, tenantId);

    // Send 204 No Content on successful deletion/deactivation
    res.status(httpStatus.NO_CONTENT).send();
});


// Export all controller methods
export const customerController = {
    createCustomer,
    getCustomers,
    getCustomer,
    updateCustomer,
    deleteCustomer,
};
