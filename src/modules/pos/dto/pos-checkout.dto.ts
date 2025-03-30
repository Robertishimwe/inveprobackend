// src/modules/pos/dto/pos-checkout.dto.ts
import { IsUUID, IsOptional, IsArray, ArrayNotEmpty, ValidateNested, IsObject, IsNumber, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from '@/modules/orders/dto/order-item.dto'; // Reuse order item DTO
import { PosPaymentDto } from './pos-payment.dto';
import { AddressDto } from '@/modules/customer/dto/address.dto'; // Reuse address

export class PosCheckoutDto {
    @IsUUID('4')
    @IsOptional() // Allow guest checkout
    customerId?: string | null;

    // locationId, posTerminalId, userId come from context/auth

    @IsArray()
    @ArrayNotEmpty({ message: 'Cart must contain at least one item.' })
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto) // Use the same DTO as regular order creation
    items!: CreateOrderItemDto[];

    // Array of payments made for this transaction
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one payment method is required.' })
    @ValidateNested({ each: true })
    @Type(() => PosPaymentDto)
    payments!: PosPaymentDto[];

    // Optional order-level details specific to POS checkout
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
    discountAmount?: number = 0; // Order-level discount

    @IsObject() @ValidateNested() @Type(() => AddressDto) @IsOptional()
    shippingAddress?: AddressDto | null; // If shipping from POS

    @IsString() @IsOptional() notes?: string;
}
