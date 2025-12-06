// src/modules/orders/dto/order-item.dto.ts
import { IsUUID, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
    @IsUUID('4')
    @IsNotEmpty()
    productId!: string;

    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.0001, { message: 'Quantity must be positive.' })
    @IsNotEmpty()
    @Type(() => Number)
    quantity!: number;

    // Price is usually determined server-side based on product/rules, but allow override if needed
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0)
    @Type(() => Number)
    @IsOptional()
    unitPrice?: number; // Price *after* discounts for this item

    // Optional fields if tracking specific lots/serials *during order creation* (less common)
    @IsString() @MaxLength(100) @IsOptional() lotNumber?: string;
    @IsString() @MaxLength(255) @IsOptional() serialNumber?: string;

    @IsString() @IsOptional() notes?: string;
    // customAttributes could be added if needed per line item
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
    discountAmount?: number; // $ amount discount for this line

    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1) @Type(() => Number) @IsOptional()
    discountPercent?: number; // % discount (e.g., 0.10 for 10%) for this line

}
