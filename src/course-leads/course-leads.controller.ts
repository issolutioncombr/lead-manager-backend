import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { TenantService } from '../common/services/tenant.service';
import { CourseLeadsService } from './course-leads.service';
import { PaginatedCourseLeads } from './course-leads.repository';
import { CreateCourseLeadDto } from './dto/create-course-lead.dto';
import { UpdateCourseLeadDto } from './dto/update-course-lead.dto';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('course-leads')
export class CourseLeadsController {
  constructor(
    private readonly courseLeadsService: CourseLeadsService,
    private readonly tenantService: TenantService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto): Promise<PaginatedCourseLeads> {
    return this.courseLeadsService.list(user.userId, query);
  }

  @Get(':id')
  find(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.courseLeadsService.findById(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCourseLeadDto) {
    return this.courseLeadsService.create(user.userId, dto);
  }

  @Public()
  @Post('collect')
  async collect(@Headers('x-tenant-key') tenantKey: string, @Body() dto: CreateCourseLeadDto) {
    const tenant = await this.tenantService.resolveByApiKey(tenantKey);
    return this.courseLeadsService.create(tenant.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCourseLeadDto) {
    return this.courseLeadsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.courseLeadsService.delete(user.userId, id);
  }
}
