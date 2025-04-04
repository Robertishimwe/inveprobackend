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
exports.PosCheckoutDto = void 0;
// src/modules/pos/dto/pos-checkout.dto.ts
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const order_item_dto_1 = require("@/modules/orders/dto/order-item.dto"); // Reuse order item DTO
const pos_payment_dto_1 = require("./pos-payment.dto");
const address_dto_1 = require("@/modules/customer/dto/address.dto"); // Reuse address
class PosCheckoutDto {
    constructor() {
        // Optional order-level details specific to POS checkout
        this.discountAmount = 0; // Order-level discount
    }
}
exports.PosCheckoutDto = PosCheckoutDto;
__decorate([
    (0, class_validator_1.IsUUID)('4'),
    (0, class_validator_1.IsOptional)() // Allow guest checkout
    ,
    __metadata("design:type", Object)
], PosCheckoutDto.prototype, "customerId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)({ message: 'Cart must contain at least one item.' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => order_item_dto_1.CreateOrderItemDto) // Use the same DTO as regular order creation
    ,
    __metadata("design:type", Array)
], PosCheckoutDto.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)({ message: 'At least one payment method is required.' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => pos_payment_dto_1.PosPaymentDto),
    __metadata("design:type", Array)
], PosCheckoutDto.prototype, "payments", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], PosCheckoutDto.prototype, "discountAmount", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => address_dto_1.AddressDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], PosCheckoutDto.prototype, "shippingAddress", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PosCheckoutDto.prototype, "notes", void 0);
//# sourceMappingURL=pos-checkout.dto.js.map