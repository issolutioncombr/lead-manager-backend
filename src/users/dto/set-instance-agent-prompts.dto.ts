import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class InstanceAgentPromptItemDto {
  @IsString()
  promptId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  percent!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SetInstanceAgentPromptsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstanceAgentPromptItemDto)
  items!: InstanceAgentPromptItemDto[];
}

