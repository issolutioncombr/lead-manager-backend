import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\d{11}|\d{14})$/, { message: 'CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos.' })
  cpfCnpj!: string;
}
