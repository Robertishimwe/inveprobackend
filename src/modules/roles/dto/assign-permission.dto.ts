// src/modules/roles/dto/assign-permission.dto.ts
import { IsUUID, IsNotEmpty } from 'class-validator';

export class AssignPermissionDto {
    @IsUUID('4', { message: 'Permission ID must be a valid UUID.' })
    @IsNotEmpty({ message: 'Permission ID cannot be empty.' })
    permissionId!: string;
}