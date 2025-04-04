"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationService = void 0;
// src/modules/locations/location.service.ts
const client_1 = require("@prisma/client");
const http_status_1 = __importDefault(require("http-status"));
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
/** Create a new location */
const createLocation = async (data, tenantId) => {
    const logContext = {
        function: "createLocation",
        tenantId,
        data: { name: data.name, type: data.locationType },
    };
    // Check if name already exists for this tenant
    const existing = await config_1.prisma.location.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
        select: { id: true },
    });
    if (existing) {
        logger_1.default.warn(`Location creation failed: Name already exists`, logContext);
        throw new ApiError_1.default(http_status_1.default.CONFLICT, `Location with name "${data.name}" already exists.`);
    }
    // Validate parentLocationId if provided
    if (data.parentLocationId) {
        const parentExists = await config_1.prisma.location.count({
            where: { id: data.parentLocationId, tenantId },
        });
        if (!parentExists) {
            logger_1.default.warn(`Location creation failed: Parent location not found`, {
                ...logContext,
                parentLocationId: data.parentLocationId,
            });
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "Parent location not found.");
        }
    }
    try {
        const location = await config_1.prisma.location.create({
            data: {
                tenantId,
                name: data.name,
                locationType: data.locationType,
                parentLocationId: data.parentLocationId,
                address: data.address
                    ? data.address
                    : client_1.Prisma.JsonNull,
                isActive: true,
            },
        });
        logContext.locationId = location.id;
        logger_1.default.info(`Location created successfully`, logContext);
        return location;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating location`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002") {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Location with name "${data.name}" already exists.`);
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to create location.");
    }
};
/** Query locations */
// const queryLocations = async (filter: Prisma.LocationWhereInput, orderBy: Prisma.LocationOrderByWithRelationInput[], limit: number, page: number): Promise<{ locations: Location[], totalResults: number }> => {
//     const skip = (page - 1) * limit;
//     const logContext: LogContext = { function: 'queryLocations', tenantId: filter.tenantId, limit, page };
//      if (!filter.tenantId) {
//         logger.error('Programming Error: queryLocations called without tenantId filter', logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing for location query.');
//     }
//     try {
//         const [locations, totalResults] = await prisma.$transaction([
//             prisma.location.findMany({ where: filter, orderBy, skip, take: limit }),
//             prisma.location.count({ where: filter }),
//         ]);
//         logger.debug(`Location query successful, found ${locations.length} of ${totalResults} locations.`, logContext);
//         return { locations, totalResults };
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error querying locations`, logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve locations.');
//     }
// };
/** Query locations */
const queryLocations = async (filter, // Input filter
orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    // --- FIX: Extract tenantId safely before creating logContext ---
    const tenantIdForLog = typeof filter.tenantId === "string" ? filter.tenantId : undefined;
    // --------------------------------------------------------------
    const logContext = {
        function: "queryLocations",
        tenantId: tenantIdForLog, // Use extracted value
        limit,
        page,
    };
    if (!tenantIdForLog) {
        // Use the extracted value for the check
        logger_1.default.error("Programming Error: queryLocations called without tenantId filter", logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Tenant context missing for location query.");
    }
    try {
        // Pass the original filter object to Prisma
        const [locations, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.location.findMany({ where: filter, orderBy, skip, take: limit }),
            config_1.prisma.location.count({ where: filter }),
        ]);
        logger_1.default.debug(`Location query successful, found ${locations.length} of ${totalResults} locations.`, logContext);
        return { locations, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying locations`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve locations.");
    }
};
/** Get location by ID */
const getLocationById = async (locationId, tenantId) => {
    const logContext = {
        function: "getLocationById",
        locationId,
        tenantId,
    };
    try {
        const location = await config_1.prisma.location.findFirst({
            where: { id: locationId, tenantId },
        });
        if (!location) {
            logger_1.default.warn(`Location not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Location found successfully`, logContext);
        return location;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching location by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve location.");
    }
};
/** Update location by ID */
// const updateLocationById = async (locationId: string, updateData: UpdateLocationDto, tenantId: string): Promise<Location> => {
//      const logContext: LogContext = { function: 'updateLocationById', locationId, tenantId, data: updateData };
//     // Verify location exists first
//     const existing = await getLocationById(locationId, tenantId);
//     if (!existing) {
//         logger.warn(`Update failed: Location not found`, logContext);
//         throw new ApiError(httpStatus.NOT_FOUND, 'Location not found.');
//     }
//     // Prevent changing name to one that already exists (excluding self)
//     if (updateData.name && updateData.name !== existing.name) {
//         const nameExists = await prisma.location.findFirst({ where: { name: updateData.name, tenantId, id: { not: locationId } }, select: { id: true }});
//         if (nameExists) {
//             logger.warn(`Update failed: Name already exists`, logContext);
//             throw new ApiError(httpStatus.CONFLICT, `Location with name "${updateData.name}" already exists.`);
//         }
//     }
//     // Validate parentLocationId if provided
//      if (updateData.parentLocationId) {
//         if (updateData.parentLocationId === locationId) {
//              logger.warn(`Update failed: Location cannot be its own parent`, logContext);
//              throw new ApiError(httpStatus.BAD_REQUEST, 'Location cannot be its own parent.');
//         }
//         const parentExists = await prisma.location.count({ where: { id: updateData.parentLocationId, tenantId }});
//         if (!parentExists) {
//             logger.warn(`Update failed: Parent location not found`, logContext);
//             throw new ApiError(httpStatus.BAD_REQUEST, 'Parent location not found.');
//         }
//     }
//     // Prepare update payload
//     const dataToUpdate: Prisma.LocationUpdateInput = {};
//     if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
//     if (updateData.locationType !== undefined) dataToUpdate.locationType = updateData.locationType;
//     if (updateData.parentLocationId !== undefined) dataToUpdate.parentLocationId = updateData.parentLocationId; // Allows setting to null
//     if (updateData.isActive !== undefined) dataToUpdate.isActive = updateData.isActive;
//     if (updateData.address !== undefined) dataToUpdate.address = updateData.address as Prisma.JsonObject ?? Prisma.JsonNull;
//     if (Object.keys(dataToUpdate).length === 0) {
//          logger.info(`Location update skipped: No changes provided`, logContext);
//          return existing;
//     }
//     try {
//         const updatedLocation = await prisma.location.update({
//             where: { id: locationId }, // Already verified tenant
//             data: dataToUpdate,
//         });
//         logger.info(`Location updated successfully`, logContext);
//         // Consider invalidating location cache if implemented
//         return updatedLocation;
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error updating location`, logContext);
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
//              throw new ApiError(httpStatus.CONFLICT, `Location name conflict during update.`);
//          }
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
//              throw new ApiError(httpStatus.NOT_FOUND, 'Location not found during update.');
//          }
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update location.');
//     }
// };
/** Update location by ID */
const updateLocationById = async (locationId, updateData, tenantId) => {
    const logContext = {
        function: "updateLocationById",
        locationId,
        tenantId,
        data: updateData,
    };
    // Verify location exists first
    const existing = await getLocationById(locationId, tenantId);
    if (!existing) {
        logger_1.default.warn(`Update failed: Location not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, "Location not found.");
    }
    // Prevent changing name to one that already exists (excluding self)
    if (updateData.name && updateData.name !== existing.name) {
        const nameExists = await config_1.prisma.location.findFirst({
            where: { name: updateData.name, tenantId, id: { not: locationId } },
            select: { id: true },
        });
        if (nameExists) {
            logger_1.default.warn(`Update failed: Name already exists`, logContext);
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Location with name "${updateData.name}" already exists.`);
        }
    }
    // Validate parentLocationId if provided
    if (updateData.parentLocationId !== undefined) {
        // Check if the key exists in the update data
        if (updateData.parentLocationId === locationId) {
            logger_1.default.warn(`Update failed: Location cannot be its own parent`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "Location cannot be its own parent.");
        }
        if (updateData.parentLocationId !== null) {
            // Only validate if not unsetting
            const parentExists = await config_1.prisma.location.count({
                where: { id: updateData.parentLocationId, tenantId },
            });
            if (!parentExists) {
                logger_1.default.warn(`Update failed: Parent location not found`, logContext);
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "Parent location not found.");
            }
        }
    }
    // Prepare update payload
    const dataToUpdate = {};
    if (updateData.name !== undefined)
        dataToUpdate.name = updateData.name;
    if (updateData.locationType !== undefined)
        dataToUpdate.locationType = updateData.locationType;
    if (updateData.isActive !== undefined)
        dataToUpdate.isActive = updateData.isActive;
    if (updateData.address !== undefined)
        dataToUpdate.address =
            updateData.address ?? client_1.Prisma.JsonNull;
    // --- FIX: Update relation using 'connect' or 'disconnect' ---
    if (updateData.parentLocationId !== undefined) {
        if (updateData.parentLocationId === null) {
            // To unset the relation (set parentLocationId to NULL)
            dataToUpdate.parentLocation = {
                disconnect: true,
            };
        }
        else {
            // To connect to a new parent
            dataToUpdate.parentLocation = {
                connect: { id: updateData.parentLocationId },
            };
        }
    }
    // ---------------------------------------------------------
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Location update skipped: No changes provided`, logContext);
        return existing;
    }
    try {
        const updatedLocation = await config_1.prisma.location.update({
            where: { id: locationId }, // Already verified tenant
            data: dataToUpdate,
        });
        logger_1.default.info(`Location updated successfully`, logContext);
        // Consider invalidating location cache if implemented
        return updatedLocation;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating location`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002") {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Location name conflict during update.`);
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025") {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, "Location not found during update.");
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to update location.");
    }
};
/** Delete location by ID (consider soft delete/deactivation) */
const deleteLocationById = async (locationId, tenantId) => {
    const logContext = {
        function: "deleteLocationById",
        locationId,
        tenantId,
    };
    // 1. Verify existence
    const existing = await getLocationById(locationId, tenantId);
    if (!existing) {
        logger_1.default.warn(`Delete failed: Location not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, "Location not found.");
    }
    // 2. Check Dependencies (Inventory, Transfers, Orders, etc.)
    const hasInventory = await config_1.prisma.inventoryItem.count({
        where: { locationId: locationId },
    });
    // Add checks for transfers (source/destination), adjustments, orders, pos sessions...
    if (hasInventory > 0 /* || other dependencies */) {
        logger_1.default.warn(`Delete failed: Location has dependencies (e.g., inventory)`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "Cannot delete location with associated inventory or activity. Consider deactivating instead.");
    }
    // 3. Perform delete
    try {
        await config_1.prisma.location.delete({ where: { id: locationId } }); // Tenant verified above
        logger_1.default.info(`Location deleted successfully`, logContext);
        // Invalidate cache if implemented
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error deleting location`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2003") {
            // Foreign key constraint
            logger_1.default.warn(`Delete failed: Foreign key constraint violation`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "Cannot delete location due to existing references.");
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025") {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, "Location not found during delete.");
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to delete location.");
    }
};
exports.locationService = {
    createLocation,
    queryLocations,
    getLocationById,
    updateLocationById,
    deleteLocationById,
};
//# sourceMappingURL=location.service.js.map