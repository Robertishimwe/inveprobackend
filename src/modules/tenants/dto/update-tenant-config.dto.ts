// src/modules/tenants/dto/update-tenant-config.dto.ts
// DTO for Tenant Admins to update *their own* configuration subset
import { IsBoolean, IsEmail, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// SMTP Auth credentials
class SmtpAuthDto {
    @IsString()
    @IsOptional()
    user?: string;

    @IsString()
    @IsOptional()
    pass?: string;
}

// SMTP Configuration
class SmtpConfigDto {
    @IsString()
    host!: string;

    @IsNumber()
    @Min(1)
    @Max(65535)
    @IsOptional()
    port?: number;

    @IsBoolean()
    @IsOptional()
    secure?: boolean;

    @ValidateNested()
    @Type(() => SmtpAuthDto)
    @IsOptional()
    auth?: SmtpAuthDto;

    @IsEmail()
    @IsOptional()
    from?: string;

    @IsString()
    @IsOptional()
    fromName?: string;
}

// This DTO should be more specific based on ALLOWED config keys a tenant admin can change.
export class UpdateTenantConfigDto {
    // Example: Allow updating a specific 'settings' key within the main JSONB config
    @IsObject()
    @IsOptional()
    settings?: Record<string, any>; // Define a stricter type if possible

    @IsString()
    @IsOptional()
    currency?: string; // e.g. 'USD', 'EUR', 'GBP'

    // SMTP configuration for email notifications
    @ValidateNested()
    @Type(() => SmtpConfigDto)
    @IsOptional()
    smtp?: SmtpConfigDto | null; // null means disable/remove SMTP

    // Enabled notification channels (e.g., ['EMAIL', 'SMS'])
    @IsOptional()
    enabledChannels?: string[];
}
