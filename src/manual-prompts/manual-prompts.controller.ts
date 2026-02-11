import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateManualPromptDto, UpdateManualPromptDto } from './dto/manual-prompt.dto';
import { ManualPromptsService } from './manual-prompts.service';

type AuthenticatedUser = { userId: string };

@Controller('prompts/manual')
export class ManualPromptsController {
  constructor(private readonly service: ManualPromptsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.get(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManualPromptDto) {
    return this.service.create(user.userId, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateManualPromptDto) {
    return this.service.update(user.userId, id, dto);
  }
}

