// src/modules/locations/location.service.ts
import { Prisma, Location } from "@prisma/client";
import httpStatus from "http-status";
import { prisma } from "@/config";
import ApiError from "@/utils/ApiError";
import logger from "@/utils/logger";
import { CreateLocationDto } from "./dto/create-location.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";

type LogContext = {
  function?: string;
  locationId?: string | null;
  tenantId?: string | null;
  data?: any;
  error?: any;
  [key: string]: any;
};

/** Create a new location */
const createLocation = async (
  data: CreateLocationDto,
  tenantId: string
): Promise<Location> => {
  const logContext: LogContext = {
    function: "createLocation",
    tenantId,
    data: { name: data.name, type: data.locationType },
  };
  // Check if name already exists for this tenant
  const existing = await prisma.location.findUnique({
    where: { tenantId_name: { tenantId, name: data.name } },
    select: { id: true },
  });
  if (existing) {
    logger.warn(`Location creation failed: Name already exists`, logContext);
    throw new ApiError(
      httpStatus.CONFLICT,
      `Location with name "${data.name}" already exists.`
    );
  }

  // Validate parentLocationId if provided
  if (data.parentLocationId) {
    const parentExists = await prisma.location.count({
      where: { id: data.parentLocationId, tenantId },
    });
    if (!parentExists) {
      logger.warn(`Location creation failed: Parent location not found`, {
        ...logContext,
        parentLocationId: data.parentLocationId,
      });
      throw new ApiError(httpStatus.BAD_REQUEST, "Parent location not found.");
    }
  }

  try {
    const location = await prisma.location.create({
      data: {
        tenantId,
        name: data.name,
        locationType: data.locationType,
        parentLocationId: data.parentLocationId,
        address: data.address
          ? (data.address as Prisma.JsonObject)
          : Prisma.JsonNull,
        isActive: true,
      },
    });
    logContext.locationId = location.id;
    logger.info(`Location created successfully`, logContext);
    return location;
  } catch (error: any) {
    logContext.error = error;
    logger.error(`Error creating location`, logContext);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `Location with name "${data.name}" already exists.`
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to create location."
    );
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
const queryLocations = async (
  filter: Prisma.LocationWhereInput, // Input filter
  orderBy: Prisma.LocationOrderByWithRelationInput[],
  limit: number,
  page: number
): Promise<{ locations: Location[]; totalResults: number }> => {
  const skip = (page - 1) * limit;

  // --- FIX: Extract tenantId safely before creating logContext ---
  const tenantIdForLog: string | undefined =
    typeof filter.tenantId === "string" ? filter.tenantId : undefined;
  // --------------------------------------------------------------

  const logContext: LogContext = {
    function: "queryLocations",
    tenantId: tenantIdForLog, // Use extracted value
    limit,
    page,
  };

  if (!tenantIdForLog) {
    // Use the extracted value for the check
    logger.error(
      "Programming Error: queryLocations called without tenantId filter",
      logContext
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Tenant context missing for location query."
    );
  }
  try {
    // Pass the original filter object to Prisma
    const [locations, totalResults] = await prisma.$transaction([
      prisma.location.findMany({ where: filter, orderBy, skip, take: limit }),
      prisma.location.count({ where: filter }),
    ]);
    logger.debug(
      `Location query successful, found ${locations.length} of ${totalResults} locations.`,
      logContext
    );
    return { locations, totalResults };
  } catch (error: any) {
    logContext.error = error;
    logger.error(`Error querying locations`, logContext);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to retrieve locations."
    );
  }
};
/** Get location by ID */
const getLocationById = async (
  locationId: string,
  tenantId: string
): Promise<Location | null> => {
  const logContext: LogContext = {
    function: "getLocationById",
    locationId,
    tenantId,
  };
  try {
    const location = await prisma.location.findFirst({
      where: { id: locationId, tenantId },
    });
    if (!location) {
      logger.warn(`Location not found or tenant mismatch`, logContext);
      return null;
    }
    logger.debug(`Location found successfully`, logContext);
    return location;
  } catch (error: any) {
    logContext.error = error;
    logger.error(`Error fetching location by ID`, logContext);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to retrieve location."
    );
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
const updateLocationById = async (
  locationId: string,
  updateData: UpdateLocationDto,
  tenantId: string
): Promise<Location> => {
  const logContext: LogContext = {
    function: "updateLocationById",
    locationId,
    tenantId,
    data: updateData,
  };
  // Verify location exists first
  const existing = await getLocationById(locationId, tenantId);
  if (!existing) {
    logger.warn(`Update failed: Location not found`, logContext);
    throw new ApiError(httpStatus.NOT_FOUND, "Location not found.");
  }

  // Prevent changing name to one that already exists (excluding self)
  if (updateData.name && updateData.name !== existing.name) {
    const nameExists = await prisma.location.findFirst({
      where: { name: updateData.name, tenantId, id: { not: locationId } },
      select: { id: true },
    });
    if (nameExists) {
      logger.warn(`Update failed: Name already exists`, logContext);
      throw new ApiError(
        httpStatus.CONFLICT,
        `Location with name "${updateData.name}" already exists.`
      );
    }
  }

  // Validate parentLocationId if provided
  if (updateData.parentLocationId !== undefined) {
    // Check if the key exists in the update data
    if (updateData.parentLocationId === locationId) {
      logger.warn(
        `Update failed: Location cannot be its own parent`,
        logContext
      );
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Location cannot be its own parent."
      );
    }
    if (updateData.parentLocationId !== null) {
      // Only validate if not unsetting
      const parentExists = await prisma.location.count({
        where: { id: updateData.parentLocationId, tenantId },
      });
      if (!parentExists) {
        logger.warn(`Update failed: Parent location not found`, logContext);
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Parent location not found."
        );
      }
    }
  }

  // Prepare update payload
  const dataToUpdate: Prisma.LocationUpdateInput = {};
  if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
  if (updateData.locationType !== undefined)
    dataToUpdate.locationType = updateData.locationType;
  if (updateData.isActive !== undefined)
    dataToUpdate.isActive = updateData.isActive;
  if (updateData.address !== undefined)
    dataToUpdate.address =
      (updateData.address as Prisma.JsonObject) ?? Prisma.JsonNull;

  // --- FIX: Update relation using 'connect' or 'disconnect' ---
  if (updateData.parentLocationId !== undefined) {
    if (updateData.parentLocationId === null) {
      // To unset the relation (set parentLocationId to NULL)
      dataToUpdate.parentLocation = {
        disconnect: true,
      };
    } else {
      // To connect to a new parent
      dataToUpdate.parentLocation = {
        connect: { id: updateData.parentLocationId },
      };
    }
  }
  // ---------------------------------------------------------

  if (Object.keys(dataToUpdate).length === 0) {
    logger.info(`Location update skipped: No changes provided`, logContext);
    return existing;
  }

  try {
    const updatedLocation = await prisma.location.update({
      where: { id: locationId }, // Already verified tenant
      data: dataToUpdate,
    });
    logger.info(`Location updated successfully`, logContext);
    // Consider invalidating location cache if implemented
    return updatedLocation;
  } catch (error: any) {
    logContext.error = error;
    logger.error(`Error updating location`, logContext);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `Location name conflict during update.`
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Location not found during update."
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to update location."
    );
  }
};

/** Delete location by ID (consider soft delete/deactivation) */
const deleteLocationById = async (
  locationId: string,
  tenantId: string
): Promise<void> => {
  const logContext: LogContext = {
    function: "deleteLocationById",
    locationId,
    tenantId,
  };
  // 1. Verify existence
  const existing = await getLocationById(locationId, tenantId);
  if (!existing) {
    logger.warn(`Delete failed: Location not found`, logContext);
    throw new ApiError(httpStatus.NOT_FOUND, "Location not found.");
  }

  // 2. Check Dependencies (Inventory, Transfers, Orders, etc.)
  const hasInventory = await prisma.inventoryItem.count({
    where: { locationId: locationId },
  });
  // Add checks for transfers (source/destination), adjustments, orders, pos sessions...
  if (hasInventory > 0 /* || other dependencies */) {
    logger.warn(
      `Delete failed: Location has dependencies (e.g., inventory)`,
      logContext
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot delete location with associated inventory or activity. Consider deactivating instead."
    );
  }

  // 3. Perform delete
  try {
    await prisma.location.delete({ where: { id: locationId } }); // Tenant verified above
    logger.info(`Location deleted successfully`, logContext);
    // Invalidate cache if implemented
  } catch (error: any) {
    logContext.error = error;
    logger.error(`Error deleting location`, logContext);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      // Foreign key constraint
      logger.warn(
        `Delete failed: Foreign key constraint violation`,
        logContext
      );
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Cannot delete location due to existing references."
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Location not found during delete."
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to delete location."
    );
  }
};

export const locationService = {
  createLocation,
  queryLocations,
  getLocationById,
  updateLocationById,
  deleteLocationById,
};
