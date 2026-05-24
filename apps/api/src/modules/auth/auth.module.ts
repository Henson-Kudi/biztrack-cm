import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { AuthController } from './auth.controller'
import { InvitesController } from './invites.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { UsersModule } from '../users/users.module'
import { User } from '../../entities/user.entity'
import { RefreshToken } from '../../entities/refresh-token.entity'
import { VerificationCode } from '../../entities/verification-code.entity'
import { Business } from '../../entities/business.entity'
import { BusinessMember } from '../../entities/business-member.entity'
import { PendingInvite } from '../../entities/pending-invite.entity'
import { AuthUsersRepository } from './repositories/auth-users.repository'
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository'
import { VerificationCodesRepository } from './repositories/verification-codes.repository'
import { BusinessMembersRepository } from './repositories/business-members.repository'
import { PendingInvitesRepository } from './repositories/pending-invites.repository'
import type { AppConfig } from '@/config/configuration'
import { PasswordManager } from '@/common/security/password-manager'
import { RedisModule } from '@/common/redis/redis.module'
import { AuthRateLimitGuard } from '@/common/guards/auth-rate-limit.guard'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { BusinessModule } from '@/modules/business/business.module'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { RolesModule } from '@/modules/roles/roles.module'

@Module({
  imports: [
    UsersModule,
    BusinessModule,
    NotificationsModule,
    PassportModule,
    RedisModule,
    PermissionsModule,
    RolesModule,
    TypeOrmModule.forFeature([User, RefreshToken, VerificationCode, Business, BusinessMember, PendingInvite]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        secret: config.get<string>('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController, InvitesController],
  providers: [
    AuthUsersRepository,
    RefreshTokensRepository,
    VerificationCodesRepository,
    BusinessMembersRepository,
    PendingInvitesRepository,
    PasswordManager,
    AuthRateLimitGuard,
    AuthService,
    JwtStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
