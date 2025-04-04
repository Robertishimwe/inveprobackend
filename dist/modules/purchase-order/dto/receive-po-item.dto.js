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
exports.ReceivePOItemDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class ReceivePOItemDto {
}
exports.ReceivePOItemDto = ReceivePOItemDto;
__decorate([
    (0, class_validator_1.IsUUID)('4', { message: 'PO Item ID must be a valid UUID.' }),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ReceivePOItemDto.prototype, "poItemId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Quantity received must be a number.' }),
    (0, class_validator_1.Min)(0.0001, { message: 'Quantity received must be positive.' }),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], ReceivePOItemDto.prototype, "quantityReceived", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ReceivePOItemDto.prototype, "lotNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ReceivePOItemDto.prototype, "serialNumber", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ReceivePOItemDto.prototype, "expiryDate", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.ArrayMinSize)(1) // If provided, must not be empty
    ,
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], ReceivePOItemDto.prototype, "serialNumbers", void 0);
//# sourceMappingURL=receive-po-item.dto.js.map