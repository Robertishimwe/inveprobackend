// src/modules/pos/dto/end-session.dto.ts
import { IsNumber, IsNotEmpty, Min, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class EndSessionDto {
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Ending cash must be a number.' })
    @Min(0, { message: 'Ending cash cannot be negative.' })
    @IsNotEmpty({ message: 'Ending cash amount (counted) is required.' })
    @Type(() => Number)
    endingCash!: number; // The actual amount counted in the drawer

    @IsString()
    @IsOptional()
    notes?: string; // Optional notes for reconciliation differences
}
