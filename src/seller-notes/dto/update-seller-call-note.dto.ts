import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSellerCallNoteDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;
}

