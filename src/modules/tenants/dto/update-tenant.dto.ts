// src/modules/tenants/dto/update-tenant.dto.ts
import { TenantStatus } from '@prisma/client';
import { IsString, MaxLength, IsOptional, IsEnum, IsNotEmpty, IsJSON } from 'class-validator';

// DTO for Super Admin updates
export class UpdateTenantDto {
    @IsString()
    @IsNotEmpty({ message: 'Tenant name cannot be empty if provided.' })
    @MaxLength(255)
    @IsOptional()
    name?: string;

    @IsEnum(TenantStatus)
    @IsOptional()
    status?: TenantStatus; // Allow Super Admin to change status

    // Allow updating the general configuration blob (use with caution for sensitive data)
    @IsJSON({ message: 'Configuration must be a valid JSON string if provided.' })
    @IsOptional()
    configuration?: string | null; // Allow clearing with null
}
