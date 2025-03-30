// src/modules/pos/dto/pos-payment.dto.ts
// Part of the main checkout DTO
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class PosPaymentDto {
    @IsEnum(PaymentMethod)
    @IsNotEmpty()
    paymentMethod!: PaymentMethod;

    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.01, { message: 'Payment amount must be positive.' }) // Min 0.01 for payments
    @IsNotEmpty()
    @Type(() => Number)
    amount!: number;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    transactionReference?: string; // e.g., Credit card auth code, check number

    // Add other payment-specific details if needed (e.g., gift card ID)
}
