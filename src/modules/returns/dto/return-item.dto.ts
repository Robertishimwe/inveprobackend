// src/modules/returns/dto/return-item.dto.ts
import { ReturnItemCondition } from '@prisma/client';
import { IsUUID, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnItemDto {
    @IsUUID('4', { message: 'Product ID must be a valid UUID.'})
    @IsNotEmpty()
    productId!: string;

    @IsUUID('4', { message: 'Original Order Item ID must be a valid UUID if provided.'})
    @IsOptional() // Optional: Only present if return is linked to original sale line
    originalOrderItemId?: string;

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Quantity must be a number.'})
    @Min(0.0001, { message: 'Quantity must be positive.'})
    @IsNotEmpty()
    @Type(() => Number)
    quantity!: number; // Quantity being returned

    @IsEnum(ReturnItemCondition, { message: 'Invalid item condition provided.'})
    @IsNotEmpty({ message: 'Item condition is required.'})
    condition!: ReturnItemCondition; // 'SELLABLE', 'DAMAGED', 'DEFECTIVE', 'DISPOSED'

    // Optional: Price override for blind returns? Service calculates based on rules otherwise.
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Refund price must be a number.'})
    @Min(0, { message: 'Refund price cannot be negative.'})
    @Type(() => Number)
    @IsOptional()
    unitRefundPrice?: number;

    // Optional: Explicit restock flag? Service can derive from condition. Let's keep it explicit.
    @IsBoolean({ message: 'Restock must be a boolean value.'})
    @IsOptional()
    restock?: boolean = false; // Default to not restocking unless explicitly set or condition is SELLABLE

    @IsString() @MaxLength(255) @IsOptional() serialNumber?: string; // If returning a specific serialized item
    @IsString() @MaxLength(100) @IsOptional() lotNumber?: string; // If returning from a specific lot
}
