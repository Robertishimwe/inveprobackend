import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class UpdateRoleDto {
    @IsString()
    @IsNotEmpty({ message: 'Role name cannot be empty if provided.' })
    @MaxLength(100)
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    // // Use this to SET the permissions for the role (replaces existing)
    // @IsArray()
    // @IsUUID('4', { each: true, message: 'Each permission ID must be a valid UUID.' })
    // @IsOptional() // Allow updating only name/description without touching permissions
    // permissionIds?: string[];
}
