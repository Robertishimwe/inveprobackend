// src/modules/tenants/dto/manage-tenant-admins.dto.ts
import { IsArray, ArrayNotEmpty, ArrayMaxSize, IsUUID } from 'class-validator';

export class ManageTenantAdminsDto {
    /**
     * An array containing the UUIDs of the users who should be administrators for this tenant.
     * Must contain 1 or 2 user IDs. Replaces the existing admins.
     */
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one admin user ID must be provided.' })
    @ArrayMaxSize(2, { message: 'A tenant cannot have more than two administrators.' }) // Enforce max admins
    @IsUUID('4', { each: true, message: 'Each admin user ID must be a valid UUID.' })
    adminUserIds!: string[];
}
