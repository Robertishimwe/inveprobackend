import { IsUUID, IsNotEmpty, IsNumber, Min, IsOptional, IsString, MaxLength, IsDateString, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceivePOItemDto {
    @IsUUID('4', { message: 'PO Item ID must be a valid UUID.'})
    @IsNotEmpty()
    poItemId!: string; // The specific PO line item being received against

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Quantity received must be a number.'})
    @Min(0.0001, { message: 'Quantity received must be positive.'})
    @IsNotEmpty()
    @Type(() => Number)
    quantityReceived!: number;

    // Optional receiving details
    @IsString() @MaxLength(100) @IsOptional() lotNumber?: string;
    @IsString() @MaxLength(255) @IsOptional() serialNumber?: string; // Use serialNumbers array for multi-serial items
    @IsDateString() @IsOptional() expiryDate?: string; // ISO 8601 format

    // For receiving multiple serial numbers against a single line item receipt (if quantityReceived > 1)
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1) // If provided, must not be empty
    @IsOptional()
    serialNumbers?: string[];
}
