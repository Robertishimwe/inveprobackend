import { StockCountType } from '@prisma/client';
import { IsString, IsNotEmpty, IsUUID, IsOptional, IsEnum, IsArray } from 'class-validator';

export class InitiateStockCountDto {
    @IsUUID('4')
    @IsNotEmpty({ message: 'Location ID is required.' })
    locationId!: string;

    @IsEnum(StockCountType)
    @IsNotEmpty({ message: 'Count type (FULL or CYCLE) is required.' })
    type!: StockCountType;

    // Optional: For CYCLE counts, specify product IDs or other criteria
    @IsArray()
    @IsUUID('4', { each: true, message: 'Each product ID must be a valid UUID.' })
    @IsOptional()
    productIds?: string[]; // Explicit list of product IDs for cycle count

    // TODO: Add other filter criteria for cycle counts if needed (e.g., categoryId, velocity 'A', specific bins)
    // @IsUUID('4') @IsOptional() categoryId?: string;
    // @IsString() @IsOptional() zoneOrBin?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}
