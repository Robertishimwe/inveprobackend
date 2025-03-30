// src/modules/locations/dto/create-location.dto.ts
import { LocationType } from '@prisma/client';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID, IsEnum, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Simple Address structure for JSON field
export class AddressDto {
    @IsString() @IsOptional() street?: string;
    @IsString() @IsOptional() city?: string;
    @IsString() @IsOptional() state?: string;
    @IsString() @IsOptional() postalCode?: string;
    @IsString() @IsOptional() country?: string;
}


export class CreateLocationDto {
    @IsString()
    @IsNotEmpty({ message: 'Location name cannot be empty.' })
    @MaxLength(255)
    name!: string;

    @IsEnum(LocationType)
    @IsOptional()
    locationType?: LocationType = LocationType.STORE; // Default to STORE or WAREHOUSE?

    @IsUUID('4', { message: 'Parent location ID must be a valid UUID.'})
    @IsOptional()
    parentLocationId?: string | null; // Allow null to unset parent

    @IsObject()
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    address?: AddressDto;

    // tenantId is added by service/context
    // isActive defaults to true
}
