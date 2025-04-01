import { IsString, IsNotEmpty, MaxLength, IsOptional, IsArray, IsUUID } from 'class-validator';

export class CreateRoleDto {
    @IsString()
    @IsNotEmpty({ message: 'Role name cannot be empty.' })
    @MaxLength(100)
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;

    // Permissions assigned during creation
    @IsArray()
    @IsUUID('4', { each: true, message: 'Each permission ID must be a valid UUID.' })
    @IsOptional() // Can create a role with no permissions initially
    permissionIds?: string[];

    // tenantId from context
    // isSystemRole defaults false
}
