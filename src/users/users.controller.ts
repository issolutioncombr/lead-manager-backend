import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersRepository } from './users.repository';

interface ToggleAdminBody {
  isAdmin: boolean;
}

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly usersRepo: UsersRepository) {}

  @Get()
  async listAll(@CurrentUser() user: { role?: string; isAdmin?: boolean }) {
    if (!(user?.isAdmin || user?.role === 'admin')) {
      return [];
    }
    return this.usersRepo.findAll();
  }

  @Get('pending')
  async listPending(@CurrentUser() user: { role?: string; isAdmin?: boolean }) {
    if (!(user?.isAdmin || user?.role === 'admin')) {
      return [];
    }
    return this.usersRepo.findPendingApprovals();
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: { role?: string; isAdmin?: boolean }) {
    if (!(user?.isAdmin || user?.role === 'admin')) {
      return { id };
    }
    return this.usersRepo.approveUser(id);
  }

  @Patch(':id/admin')
  async setAdmin(
    @Param('id') id: string,
    @Body() body: ToggleAdminBody,
    @CurrentUser() user: { role?: string; isAdmin?: boolean }
  ) {
    if (!(user?.isAdmin || user?.role === 'admin')) {
      return { id, isAdmin: false };
    }
    return this.usersRepo.setAdmin(id, body.isAdmin);
  }
}
