import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAgentPromptLibraryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

