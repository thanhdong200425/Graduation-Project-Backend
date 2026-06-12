import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminUpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;
}
