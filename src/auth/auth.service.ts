import { ConflictException, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Seller, User } from '@prisma/client';

export interface AuthPayload {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    apiKey: string;
  };
  seller: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface PendingPasswordChangePayload {
  requiresPasswordChange: true;
  passwordSetupToken: string;
  seller: {
    id: string;
    name: string;
    email: string;
  };
}

export type LoginResponse = AuthPayload | PendingPasswordChangePayload;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    const [existingUser, existingSeller] = await Promise.all([
      this.usersService.findByEmail(dto.email),
      this.prisma.seller.findUnique({ where: { email: dto.email } })
    ]);

    if (existingUser || existingSeller) {
      throw new ConflictException('E-mail ja cadastrado.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
      role: dto.role ?? 'user'
    });
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const seller = await this.prisma.seller.findUnique({
      where: { email: dto.email },
      include: { user: true }
    });

    if (seller?.user) {
      const passwordMatches = await bcrypt.compare(dto.password, seller.password);
      if (!passwordMatches) {
        throw new UnauthorizedException('Credenciais invalidas');
      }
      if (seller.mustChangePassword) {
        const passwordSetupToken = await this.issuePasswordResetToken(seller.id);
        return {
          requiresPasswordChange: true,
          passwordSetupToken,
          seller: {
            id: seller.id,
            name: seller.name,
            email: seller.email
          }
        };
      }
      return this.buildAuthPayload(seller.user, seller);
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    return this.buildAuthPayload(user, null);
  }

  private buildAuthPayload(user: User, seller: Pick<Seller, 'id' | 'name' | 'email'> | null): AuthPayload {
    const payload: Record<string, unknown> = {
      sub: user.id,
      email: user.email
    };
    if (seller) {
      payload['sellerId'] = seller.id;
      payload['sellerEmail'] = seller.email;
      payload['sellerName'] = seller.name;
    }

    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        apiKey: user.apiKey
      },
      seller: seller
        ? {
            id: seller.id,
            name: seller.name,
            email: seller.email
          }
        : null
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const seller = await this.prisma.seller.findUnique({ where: { email: dto.email } });
    // Respond success regardless to avoid user enumeration
    if (!seller) {
      return;
    }

    const raw = await this.issuePasswordResetToken(seller.id);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${raw}&email=${encodeURIComponent(dto.email)}`;
    await this.mail.sendPasswordResetEmail(dto.email, resetUrl);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const seller = await this.prisma.seller.findUnique({ where: { email: dto.email } });
    if (!seller) {
      // generic
      throw new BadRequestException('Token invalido ou expirado.');
    }

    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const token = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!token || token.sellerId !== seller.id) {
      throw new BadRequestException('Token invalido ou expirado.');
    }
    if (token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Token invalido ou expirado.');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.seller.update({
        where: { id: seller.id },
        data: { password: newHash, mustChangePassword: false }
      }),
      this.prisma.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.deleteMany({
        where: { sellerId: seller.id, tokenHash: { not: tokenHash } }
      })
    ]);
  }

  private async issuePasswordResetToken(sellerId: string): Promise<string> {
    await this.prisma.passwordResetToken.deleteMany({ where: { sellerId } });

    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        sellerId,
        tokenHash,
        expiresAt
      }
    });

    return raw;
  }
}
