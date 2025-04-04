"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceivePurchaseOrderDto = void 0;
// src/modules/purchase-orders/dto/receive-po.dto.ts
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const receive_po_item_dto_1 = require("./receive-po-item.dto"); // Ensure this import path is correct
/**
 * Data Transfer Object for receiving items against a Purchase Order.
 * Contains an array of items being received in this specific receiving action.
 */
class ReceivePurchaseOrderDto {
}
exports.ReceivePurchaseOrderDto = ReceivePurchaseOrderDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)({ message: 'At least one item must be specified for receiving.' }),
    (0, class_validator_1.ValidateNested)({ each: true }) // Validate each object in the array using ReceivePOItemDto rules
    ,
    (0, class_transformer_1.Type)(() => receive_po_item_dto_1.ReceivePOItemDto) // Tell class-transformer to instantiate ReceivePOItemDto for validation
    ,
    __metadata("design:type", Array)
], ReceivePurchaseOrderDto.prototype, "items", void 0);
//# sourceMappingURL=receive-po.dto.js.map