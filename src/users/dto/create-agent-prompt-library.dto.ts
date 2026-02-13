import { IsOptional, IsString } from 'class-validator';

export class CreateAgentPromptLibraryDto {
  @IsString()
  categoryId!: string;

  @IsString()
  name!: string;

  @IsString()
  prompt!: string;
}
