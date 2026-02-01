import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET')
    });
  }

  async validate(payload: { sub: string; email: string; role?: string; isAdmin?: boolean; sellerId?: string; sellerEmail?: string; sellerName?: string }) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      isAdmin: payload.isAdmin,
      sellerId: payload.sellerId,
      sellerEmail: payload.sellerEmail,
      sellerName: payload.sellerName
    };
  }
}
