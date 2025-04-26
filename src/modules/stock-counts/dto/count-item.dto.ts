import { IsNotEmpty, IsUUID, IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

// DTO for a single item count entry
export class CountItemDto {
    @IsUUID('4')
    @IsNotEmpty()
    stockCountItemId!: string; // The ID of the specific line item on the StockCount sheet

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Counted quantity must be a number.'})
    @Min(0, { message: 'Counted quantity cannot be negative.' }) // Allow zero count
    @IsNotEmpty({ message: 'Counted quantity is required.'})
    @Type(() => Number)
    countedQuantity!: number;

    // Optional fields if tracking specific lots/serials during count
    @IsString() @MaxLength(100) @IsOptional() lotNumber?: string;
    @IsString() @MaxLength(255) @IsOptional() serialNumber?: string;

    @IsString() @IsOptional() notes?: string; // Notes specific to this item count
}
