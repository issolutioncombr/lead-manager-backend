import { IsOptional, IsString } from 'class-validator';

export class EvolutionGenerateQrDto {
  @IsOptional()
  @IsString()
  number?: string;
}

