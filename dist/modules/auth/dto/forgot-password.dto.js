"use strict";
// // src/modules/auth/dto/forgot-password.dto.ts
// import { IsEmail, IsNotEmpty } from 'class-validator';
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
exports.ForgotPasswordDto = void 0;
// export class ForgotPasswordDto {
//   @IsEmail({}, { message: 'Please provide a valid email address.' })
//   @IsNotEmpty({ message: 'Email cannot be empty.' })
//   email: string;
// }
// src/modules/auth/dto/forgot-password.dto.ts
const class_validator_1 = require("class-validator");
class ForgotPasswordDto {
}
exports.ForgotPasswordDto = ForgotPasswordDto;
__decorate([
    (0, class_validator_1.IsEmail)({}, { message: 'Please provide a valid email address.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Email cannot be empty.' }),
    __metadata("design:type", String)
], ForgotPasswordDto.prototype, "email", void 0);
//# sourceMappingURL=forgot-password.dto.js.map