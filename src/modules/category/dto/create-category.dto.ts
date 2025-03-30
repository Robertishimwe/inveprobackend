// src/modules/categories/dto/create-category.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class CreateCategoryDto {
    @IsString()
    @IsNotEmpty({ message: 'Category name cannot be empty.' })
    @MaxLength(255)
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsUUID('4', { message: 'Parent category ID must be a valid UUID.' })
    @IsOptional() // Optional: Top-level categories won't have a parent
    parentCategoryId?: string | null; // Allow explicitly setting to null for top-level

    // tenantId comes from context
}
