"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/locations/location.routes.ts
const express_1 = __importDefault(require("express"));
const location_controller_1 = require("./location.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_location_dto_1 = require("./dto/create-location.dto");
const update_location_dto_1 = require("./dto/update-location.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth & tenant context to all location routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Location Routes
router.route('/')
    .post((0, rbac_middleware_1.checkPermissions)(['location:create']), // Define this permission
(0, validate_middleware_1.default)(create_location_dto_1.CreateLocationDto), location_controller_1.locationController.createLocation)
    .get((0, rbac_middleware_1.checkPermissions)(['location:read']), // Define this permission
location_controller_1.locationController.getLocations);
router.route('/:locationId')
    .get((0, rbac_middleware_1.checkPermissions)(['location:read']), location_controller_1.locationController.getLocation)
    .patch((0, rbac_middleware_1.checkPermissions)(['location:update']), // Define this permission
(0, validate_middleware_1.default)(update_location_dto_1.UpdateLocationDto), location_controller_1.locationController.updateLocation)
    .delete((0, rbac_middleware_1.checkPermissions)(['location:delete']), // Define this permission
location_controller_1.locationController.deleteLocation);
exports.default = router;
//# sourceMappingURL=location.routes.js.map