import { IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';

export class BatchPermissionsDto {
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one permission ID must be provided.' })
    @IsUUID('4', { each: true, message: 'Each permission ID must be a valid UUID.' })
    permissionIds!: string[]; // Array of Permission UUIDs
}
