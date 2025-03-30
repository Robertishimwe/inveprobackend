// src/modules/locations/dto/update-location.dto.ts
import { LocationType } from '@prisma/client';
import { IsString, MaxLength, IsOptional, IsUUID, IsEnum, IsObject, ValidateNested, IsBoolean, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from './create-location.dto'; // Reuse AddressDto

export class UpdateLocationDto {
    @IsString()
    @IsNotEmpty({ message: 'Location name cannot be empty if provided.' })
    @MaxLength(255)
    @IsOptional()
    name?: string;

    @IsEnum(LocationType)
    @IsOptional()
    locationType?: LocationType;

    @IsUUID('4', { message: 'Parent location ID must be a valid UUID.'})
    @IsOptional()
    parentLocationId?: string | null; // Allow updating/unsetting parent

    @IsObject()
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    address?: AddressDto;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
