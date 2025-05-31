// src/modules/reports/dto/report-query.dto.ts
import { IsOptional, IsString, IsDateString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// Common query parameters for many reports
export class ReportQueryDto {
    @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string.' })
    @IsOptional()
    startDate?: string;

    @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string.' })
    @IsOptional()
    endDate?: string;

    @IsUUID('4', { message: 'locationId must be a valid UUID.'})
    @IsOptional()
    locationId?: string;

    @IsUUID('4', { message: 'productId must be a valid UUID.'})
    @IsOptional()
    productId?: string;

    @IsUUID('4', { message: 'categoryId must be a valid UUID.'})
    @IsOptional()
    categoryId?: string;

    @IsUUID('4', { message: 'customerId must be a valid UUID.'})
    @IsOptional()
    customerId?: string;

    @IsUUID('4', { message: 'userId must be a valid UUID.'})
    @IsOptional()
    userId?: string; // For sales by staff etc.

    // Pagination
    @IsInt() @Min(1) @Type(() => Number) @IsOptional()
    page?: number = 1;

    @IsInt() @Min(1) @Max(1000) @Type(() => Number) @IsOptional() // Max limit
    limit?: number = 50;

    // Sorting - handled as string like "field:asc,field2:desc" in controller
    @IsString() @IsOptional()
    sortBy?: string;

    // Time Period (for comparisons, e.g., 'today', 'yesterday', '7d', '30d', 'month', 'year')
    @IsString() @IsOptional()
    period?: string = 'today'; // Default period for KPIs maybe?
}
