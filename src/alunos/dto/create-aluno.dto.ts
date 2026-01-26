import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateAlunoDto {
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
  profissao?: string;
}

