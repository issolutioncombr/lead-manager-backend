import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateCourseLeadDto {
  @IsString()
  nomeCompleto!: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  origem?: string;

  @IsOptional()
  @IsString()
  nota?: string;
}
