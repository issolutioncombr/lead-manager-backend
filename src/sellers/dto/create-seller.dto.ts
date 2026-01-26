import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSellerDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

}
