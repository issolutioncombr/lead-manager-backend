import { IsIn, IsString } from 'class-validator';

export class BotActionDto {
  @IsString()
  @IsIn(['travar', 'pausar', 'reativar'])
  action!: 'travar' | 'pausar' | 'reativar';
}
