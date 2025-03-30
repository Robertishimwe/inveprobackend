// src/modules/auth/dto/reset-password.dto.ts
import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token cannot be empty.' })
  token!: string; // The unhashed token from the email link

  @IsString()
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(100, { message: 'Password cannot be longer than 100 characters.' })
  // Example: require uppercase, lowercase, number, symbol
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).'
  })
  newPassword!: string;
}
