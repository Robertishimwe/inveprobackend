// src/modules/tenants/dto/update-tenant-config.dto.ts
// DTO for Tenant Admins to update *their own* configuration subset
import { IsArray, IsBoolean, IsEmail, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
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

// Channel settings for a specific alert type (in-app or email)
class AlertChannelSettingsDto {
    @IsBoolean()
    @IsOptional()
    enabled?: boolean;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    roles?: string[]; // Role names that should receive this alert (empty = ALL roles)

    @IsBoolean()
    @IsOptional()
    locationFiltering?: boolean; // If true, filter by user's assigned locations (except Admin)
}

// Settings for a specific alert type (e.g., LOW_STOCK, STOCK_OUT)
class AlertTypeSettingsDto {
    @ValidateNested()
    @Type(() => AlertChannelSettingsDto)
    @IsOptional()
    inApp?: AlertChannelSettingsDto;

    @ValidateNested()
    @Type(() => AlertChannelSettingsDto)
    @IsOptional()
    email?: AlertChannelSettingsDto;
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

    // Alert settings - per alert type configuration for notification recipients
    @IsObject()
    @IsOptional()
    alertSettings?: {
        LOW_STOCK?: AlertTypeSettingsDto;
        STOCK_OUT?: AlertTypeSettingsDto;
        EXPIRING_STOCK?: AlertTypeSettingsDto;
        SYSTEM_ALERT?: AlertTypeSettingsDto;
        [key: string]: AlertTypeSettingsDto | undefined;
    };
}

