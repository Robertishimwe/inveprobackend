// src/modules/pos/dto/pos-checkout.dto.ts
import { IsUUID, IsOptional,MaxLength, IsArray,IsNotEmpty,IsEnum, ArrayNotEmpty, ValidateNested, IsObject, IsNumber, Min,Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from '@/modules/orders/dto/order-item.dto'; // Reuse order item DTO
import { PosPaymentDto } from './pos-payment.dto';
import { AddressDto } from '@/modules/customer/dto/address.dto'; // Reuse address

export class AppliedDiscountDto {
    @IsString() @IsOptional() description?: string; // e.g., "10% Item Discount", "Manager Override"
    @IsString() @IsOptional() code?: string; // e.g., "SUMMER10", "EMP15" (for predefined/tracked discounts)
    @IsNumber() @IsNotEmpty() amount!: number; // The calculated discount amount ($)
    @IsEnum(['ITEM', 'CART']) @IsNotEmpty() level!: 'ITEM' | 'CART'; // Indicate level
    @IsUUID('4') @IsOptional() orderItemId?: string; // Link to item if ITEM level (Set server-side?)
}


export class PosOrderItemDto {
    @IsUUID('4') @IsNotEmpty() productId!: string;
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @IsNotEmpty() @Type(() => Number) quantity!: number;
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional() unitPrice?: number; // Allow price override maybe?
    @IsString() @MaxLength(100) @IsOptional() lotNumber?: string;
    @IsString() @MaxLength(255) @IsOptional() serialNumber?: string;
    @IsString() @IsOptional() notes?: string;

    // --- NEW: Allow specifying discount per item ---
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
    discountAmount?: number; // $ amount discount for this line

    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1) @Type(() => Number) @IsOptional()
    discountPercent?: number; // % discount (e.g., 0.10 for 10%) for this line
    // --- End NEW ---
}


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

    // --- NEW: Cart level discount ---
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
    cartDiscountAmount?: number = 0; // $ amount discount for the cart subtotal
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1) @Type(() => Number) @IsOptional()
    cartDiscountPercent?: number = 0; // % discount for the cart subtotal
    @IsString() @IsOptional() cartDiscountCode?: string; // Optional code/reason for cart discount
    // --- End NEW ---


    @IsObject() @ValidateNested() @Type(() => AddressDto) @IsOptional()
    shippingAddress?: AddressDto | null; // If shipping from POS

    @IsString() @IsOptional() notes?: string;
}
