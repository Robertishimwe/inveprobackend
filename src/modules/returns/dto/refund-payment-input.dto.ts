// src/modules/returns/dto/refund-payment-input.dto.ts
import { PaymentMethod } from '@prisma/client';
import {
    IsEnum, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength
} from 'class-validator';
import { Type } from 'class-transformer';

export class RefundPaymentInputDto {
    /** The method used for this refund payment (e.g., CASH, STORE_CREDIT) */
    @IsEnum(PaymentMethod, { message: 'Invalid refund payment method.' })
    @IsNotEmpty()
    paymentMethod!: PaymentMethod;

    /** The amount being refunded via this specific method. Must be positive. */
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.01, { message: 'Refund amount must be positive.' })
    @IsNotEmpty()
    @Type(() => Number)
    amount!: number;

    /** Optional reference from payment processor or internal system (e.g., gift card used) */
    @IsString() @MaxLength(255) @IsOptional() transactionReference?: string;

    // Add other relevant fields, e.g., giftCardId if method is GIFT_CARD
}
