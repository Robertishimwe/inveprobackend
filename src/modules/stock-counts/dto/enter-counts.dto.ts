// src/modules/stock-counts/dto/enter-counts.dto.ts
import { IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CountItemDto } from './count-item.dto';

// DTO for submitting multiple counts for a session
export class EnterCountsDto {
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one item count must be submitted.' })
    @ValidateNested({ each: true })
    @Type(() => CountItemDto)
    items!: CountItemDto[];
}
