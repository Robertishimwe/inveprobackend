// src/modules/categories/dto/update-category.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class UpdateCategoryDto {
    @IsString()
    @IsNotEmpty({ message: 'Category name cannot be empty if provided.' })
    @MaxLength(255)
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsUUID('4', { message: 'Parent category ID must be a valid UUID.'})
    @IsOptional()
    parentCategoryId?: string | null; // Allow changing or unsetting the parent
}
