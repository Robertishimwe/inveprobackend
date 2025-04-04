"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const permission_service_1 = require("./permission.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
/** Controller to get all available permissions */
const getPermissions = (0, catchAsync_1.default)(async (req, res) => {
    const permissions = await permission_service_1.permissionService.getAllPermissions();
    res.status(http_status_1.default.OK).send(permissions);
});
exports.permissionController = {
    getPermissions,
};
//# sourceMappingURL=permission.controller.js.map