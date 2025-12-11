import { IsUUID, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePOItemDto {
    @IsUUID('4', { message: 'Product ID must be a valid UUID.'})
    @IsNotEmpty({ message: 'Product ID is required.'})
    productId!: string;

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Quantity must be a number.'})
    @Min(0.0001, { message: 'Quantity ordered must be positive.' })
    @IsNotEmpty({ message: 'Quantity ordered is required.'})
    @Type(() => Number)
    quantityOrdered!: number;

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Unit cost must be a number.'})
    @Min(0, { message: 'Unit cost cannot be negative.'})
    @IsNotEmpty({ message: 'Unit cost is required.'})
    @Type(() => Number)
    unitCost!: number;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    description?: string; // Optional override for product name on PO line

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Tax rate must be a number.'})
    @Min(0, { message: 'Tax rate cannot be negative.'})
    @Type(() => Number)
    @IsOptional()
    taxRate?: number = 0; // Optional input, default 0

    @IsUUID('4', { message: 'UOM ID must be a valid UUID.' })
    @IsOptional()
    uomId?: string;

    // taxAmount and lineTotal are calculated in the service
}
