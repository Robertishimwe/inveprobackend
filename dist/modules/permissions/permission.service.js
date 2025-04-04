"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionService = void 0;
const config_1 = require("@/config");
const logger_1 = __importDefault(require("@/utils/logger"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
/**
 * Get all available permissions.
 */
const getAllPermissions = async () => {
    const logContext = { function: 'getAllPermissions' };
    try {
        // Permissions are usually static, caching can be very effective here
        // TODO: Implement caching for permissions list
        const permissions = await config_1.prisma.permission.findMany({
            orderBy: { permissionKey: 'asc' } // Order for consistent display
        });
        logger_1.default.debug(`Fetched ${permissions.length} permissions`);
        return permissions;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error('Error fetching permissions', logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve permissions.');
    }
};
exports.permissionService = {
    getAllPermissions,
};
//# sourceMappingURL=permission.service.js.map