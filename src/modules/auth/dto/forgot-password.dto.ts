// // src/modules/auth/dto/forgot-password.dto.ts
// import { IsEmail, IsNotEmpty } from 'class-validator';

// export class ForgotPasswordDto {
//   @IsEmail({}, { message: 'Please provide a valid email address.' })
//   @IsNotEmpty({ message: 'Email cannot be empty.' })
//   email: string;
// }


// src/modules/auth/dto/forgot-password.dto.ts
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty({ message: 'Email cannot be empty.' })
  email!: string; // <<< Add ! here
}
