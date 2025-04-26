import { IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewItemDto } from './review-item.dto';

// DTO for submitting multiple review actions
export class ReviewCountDto {
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one item review action must be submitted.' })
    @ValidateNested({ each: true })
    @Type(() => ReviewItemDto)
    items!: ReviewItemDto[];
}
