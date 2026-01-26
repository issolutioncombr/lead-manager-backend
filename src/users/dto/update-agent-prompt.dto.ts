import { IsOptional, IsString } from 'class-validator';

export class UpdateAgentPromptDto {
  @IsOptional()
  @IsString()
  prompt?: string;
}
