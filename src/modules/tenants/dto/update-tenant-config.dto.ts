// src/modules/tenants/dto/update-tenant-config.dto.ts
// DTO for Tenant Admins to update *their own* configuration subset
import { IsObject, IsOptional } from 'class-validator';

// This DTO should be more specific based on ALLOWED config keys a tenant admin can change.
// For now, we allow updating a generic 'settings' object within the main config JSONB.
export class UpdateTenantConfigDto {
    // Example: Allow updating a specific 'settings' key within the main JSONB config
    @IsObject()
    @IsOptional()
    settings?: Record<string, any>; // Define a stricter type if possible

    // Add other specific configurable fields here, e.g.:
    // @IsString() @IsOptional() defaultCurrency?: string;
    // @IsString() @IsOptional() defaultTimezone?: string;
}
