import { IsString, IsNotEmpty, IsUUID, IsOptional, MaxLength, IsArray, ArrayNotEmpty, ValidateNested, IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePOItemDto } from './po-item.dto';

export class CreatePurchaseOrderDto {
    @IsUUID('4', { message: 'Supplier ID must be a valid UUID.'})
    @IsNotEmpty({ message: 'Supplier ID is required.'})
    supplierId!: string;

    @IsUUID('4', { message: 'Location ID must be a valid UUID.'})
    @IsNotEmpty({ message: 'Delivery Location ID is required.'})
    locationId!: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    poNumber?: string; // Optional: Allow manual override ONLY if your system permits (usually discouraged)

    @IsDateString({}, { message: 'Expected delivery date must be a valid date string (ISO 8601 format) or null.'})
    @IsOptional()
    expectedDeliveryDate?: string | null;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Shipping cost must be a number.'})
    @Min(0, { message: 'Shipping cost cannot be negative.'})
    @Type(() => Number)
    @IsOptional()
    shippingCost?: number = 0;

    @IsArray()
    @ArrayNotEmpty({ message: 'Purchase order must have at least one item.' })
    @ValidateNested({ each: true })
    @Type(() => CreatePOItemDto)
    items!: CreatePOItemDto[];

    // Totals (subtotal, taxAmount, totalAmount) are calculated server-side
}
