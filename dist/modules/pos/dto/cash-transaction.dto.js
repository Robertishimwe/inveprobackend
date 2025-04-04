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
exports.CashTransactionDto = void 0;
// src/modules/pos/dto/cash-transaction.dto.ts
const client_1 = require("@prisma/client"); // Import the enum type directly
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class CashTransactionDto {
}
exports.CashTransactionDto = CashTransactionDto;
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Amount must be a number.' }),
    (0, class_validator_1.Min)(0.0001, { message: 'Amount must be positive.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Amount cannot be empty.' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], CashTransactionDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.PosTransactionType, { message: 'Invalid transaction type provided.' }),
    (0, class_validator_1.IsIn)([client_1.PosTransactionType.PAY_IN, client_1.PosTransactionType.PAY_OUT], // Check against specific enum *members*
    { message: 'Transaction type must be either PAY_IN or PAY_OUT for this operation.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Transaction type is required.' })
    // --- FIX: Use the enum type for the annotation ---
    ,
    __metadata("design:type", String)
], CashTransactionDto.prototype, "transactionType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CashTransactionDto.prototype, "notes", void 0);
//# sourceMappingURL=cash-transaction.dto.js.map