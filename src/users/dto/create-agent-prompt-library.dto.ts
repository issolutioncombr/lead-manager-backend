import { IsOptional, IsString } from 'class-validator';

export class CreateAgentPromptLibraryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  prompt!: string;
}

