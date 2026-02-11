import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { CreateLeadStatusDto } from './dto/create-lead-status.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { LeadStatusesService } from './lead-statuses.service';

@Controller('lead-statuses')
export class LeadStatusesController {
  constructor(private readonly service: LeadStatusesService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(req.user.userId);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateLeadStatusDto) {
    return this.service.create(req.user.userId, dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLeadStatusDto) {
    return this.service.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.userId, id);
  }
}

