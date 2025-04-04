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
exports.StartSessionDto = void 0;
// src/modules/pos/dto/start-session.dto.ts
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class StartSessionDto {
}
exports.StartSessionDto = StartSessionDto;
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Starting cash must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Starting cash cannot be negative.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Starting cash amount is required.' }),
    (0, class_transformer_1.Type)(() => Number) // Ensure transformation if needed
    ,
    __metadata("design:type", Number)
], StartSessionDto.prototype, "startingCash", void 0);
//# sourceMappingURL=start-session.dto.js.map