import { IsOptional, IsString } from 'class-validator';

export class CreateAgentPromptLibraryDto {
  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  prompt!: string;
}
