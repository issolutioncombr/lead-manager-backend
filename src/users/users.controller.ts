import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersRepository } from './users.repository';
import { assertSuperAdmin } from '../common/super-admin';

interface ToggleAdminBody {
  isAdmin: boolean;
}

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly usersRepo: UsersRepository) {}

  @Get()
  async listAll(@CurrentUser() user: { userId: string }) {
    await assertSuperAdmin(this.prisma, user.userId);
    return this.usersRepo.findAll();
  }

  @Get('pending')
  async listPending(@CurrentUser() user: { userId: string }) {
    await assertSuperAdmin(this.prisma, user.userId);
    return this.usersRepo.findPendingApprovals();
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    await assertSuperAdmin(this.prisma, user.userId);
    return this.usersRepo.approveUser(id);
  }

  @Patch(':id/admin')
  async setAdmin(
    @Param('id') id: string,
    @Body() body: ToggleAdminBody,
    @CurrentUser() user: { userId: string }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    return this.usersRepo.setAdmin(id, body.isAdmin);
  }
}
