// src/modules/tenants/dto/create-tenant.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsJSON, IsUUID } from 'class-validator';

export class CreateTenantDto {
    @IsString()
    @IsNotEmpty({ message: 'Tenant name cannot be empty.' })
    @MaxLength(255)
    name!: string;

    // --- FIX: Require existing User ID ---
    @IsUUID('4', { message: 'Admin User ID must be a valid UUID.' })
    @IsNotEmpty({ message: 'An initial Admin User ID is required.' })
    initialAdminUserId!: string;
    // --- End FIX ---

    // Remove admin user detail fields (firstName, lastName, email)

    @IsJSON({ message: 'Initial configuration must be a valid JSON string.' })
    @IsOptional()
    initialConfiguration?: string;
}