// src/modules/returns/dto/return-payment.dto.ts
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

// Defines how a refund portion is processed
export class ReturnPaymentDto {
    @IsEnum(PaymentMethod, { message: 'Invalid payment method specified.'})
    @IsNotEmpty()
    paymentMethod!: PaymentMethod; // CASH, CREDIT_CARD, STORE_CREDIT, GIFT_CARD etc.

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Refund amount must be a number.'})
    @Min(0.01, { message: 'Refund amount must be positive.' })
    @IsNotEmpty()
    @Type(() => Number)
    amount!: number; // Amount refunded via this method

    @IsString()
    @MaxLength(255)
    @IsOptional()
    transactionReference?: string; // Reference from payment gateway for card refunds, etc.

    // Add other details like gift card ID if needed
}
