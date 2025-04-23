// src/modules/returns/dto/return-item-input.dto.ts
import { ReturnItemCondition } from '@prisma/client';
import {
    IsUUID, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength, IsEnum, IsArray, ArrayMinSize
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnItemInputDto {
    /**
     * The ID of the original OrderItem being returned.
     * Optional if allowing returns without linking to a specific original item (e.g., returns without receipt).
     */
    @IsUUID('4', { message: 'Original order item ID must be a valid UUID if provided.' })
    @IsOptional()
    originalOrderItemId?: string | null;

    /**
     * The ID of the Product being returned. Required.
     */
    @IsUUID('4')
    @IsNotEmpty({ message: 'Product ID is required for each return item.'})
    productId!: string;

    /**
     * The quantity of this product being returned in this action. Must be positive.
     */
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Return quantity must be a number.'})
    @Min(0.0001, { message: 'Return quantity must be positive.' })
    @IsNotEmpty()
    @Type(() => Number)
    quantity!: number;

    /**
     * The condition of the returned item (e.g., SELLABLE, DAMAGED). Determines restocking.
     */
    @IsEnum(ReturnItemCondition, { message: 'Invalid item condition provided.' })
    @IsNotEmpty({ message: 'Item condition is required.' })
    condition!: ReturnItemCondition;

    /**
     * Optional: The actual price per unit being refunded.
     * If not provided, the system might calculate it based on the original order item.
     */
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0, { message: 'Unit refund amount cannot be negative.' })
    @Type(() => Number)
    @IsOptional()
    unitRefundAmount?: number;

    // --- Optional fields for tracked items ---
    /** Lot number if applicable */
    @IsString() @MaxLength(100) @IsOptional() lotNumber?: string;
    /** Single serial number if applicable (use serialNumbers for multiple) */
    @IsString() @MaxLength(255) @IsOptional() serialNumber?: string;
    /** Array of serial numbers if quantity > 1 and product is serialized */
    @IsArray() @IsString({ each: true }) @ArrayMinSize(1) @IsOptional() serialNumbers?: string[];

    /** Optional notes specific to this line item return */
    @IsString() @IsOptional() notes?: string;
}
