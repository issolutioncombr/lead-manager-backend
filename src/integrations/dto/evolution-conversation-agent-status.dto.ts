import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

const PHONE_RE = /^\+?[1-9]\d{6,14}$/;

export class EvolutionConversationAgentStatusQueryDto {
  @IsString()
  @Matches(PHONE_RE)
  instance_number!: string;

  @IsString()
  @Matches(PHONE_RE)
  contact_number!: string;
}

export class EvolutionConversationAgentStatusSetDto extends EvolutionConversationAgentStatusQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['ATIVO', 'PAUSADO', 'DESATIVADO'])
  value?: 'ATIVO' | 'PAUSADO' | 'DESATIVADO';
}

