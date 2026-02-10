import { IsOptional, IsString } from 'class-validator';

export class SetDestinationPromptAssignmentDto {
  @IsOptional()
  @IsString()
  promptId?: string | null;
}

