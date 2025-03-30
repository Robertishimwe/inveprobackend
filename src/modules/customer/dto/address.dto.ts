import { IsString, IsOptional, MaxLength } from 'class-validator';
export class AddressDto {
    @IsString() @MaxLength(255) @IsOptional() street?: string;
    @IsString() @MaxLength(100) @IsOptional() city?: string;
    @IsString() @MaxLength(100) @IsOptional() state?: string;
    @IsString() @MaxLength(20) @IsOptional() postalCode?: string;
    @IsString() @MaxLength(100) @IsOptional() country?: string;
}
