import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { v4 as uuidv4 } from 'uuid'
import {
  AuthContext,
  AuthNextStep,
  AuthPermissions,
  JwtPayload,
  LoginRequest,
  LogoutResponse,
  PrefferedPhoneChannel,
  RegisterRequest,
  RequestLoginRequest,
  ResendOtpRequest,
  SendInviteRequest,
  OtpType,
  VerificationChannel,
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessStatus,
} from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '../../logger/logger.module'
import { AuthUsersRepository } from './repositories/auth-users.repository'
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository'
import { VerificationCodesRepository } from './repositories/verification-codes.repository'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '@/config/configuration'
import { NodeEnv } from '@/config/configuration'
import { VerificationPurpose } from '@/entities/verification-code.entity'
import { IsNull } from 'typeorm'
import { randomInt } from 'crypto'
import { PasswordManager } from '@/common/security/password-manager'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppConflictException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
  AppTooManyRequestsException,
  AppUnauthorizedException,
} from '@/common/exceptions/app-exceptions'
import { OnboardingStep, User, UserStatus } from '@/entities/user.entity'
import { PermissionsService } from '@/modules/permissions/permissions.service'
import { QuotaService } from '@/modules/permissions/quota.service'
import { DEFAULT_LOCALE } from '@/common/enums/locale.enum'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { BusinessMembersRepository } from './repositories/business-members.repository'
import { PendingInvitesRepository } from './repositories/pending-invites.repository'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { RedisService } from '@/common/redis/redis.service'
import { generateSlug } from '@biztrack/utils'
import { NotificationsService } from '@/modules/notifications/services/notifications.service'
import { RolesService } from '@/modules/roles/roles.service'

@Injectable()
export class AuthService {
  constructor(
    private usersRepo: AuthUsersRepository,
    private refreshTokensRepo: RefreshTokensRepository,
    private verificationCodesRepo: VerificationCodesRepository,
    private businessMembersRepo: BusinessMembersRepository,
    private pendingInvitesRepo: PendingInvitesRepository,
    private businessesRepo: BusinessesRepository,
    private redis: RedisService,
    private jwt: JwtService,
    private config: ConfigService<AppConfig>,
    private passwordManager: PasswordManager,
    private permissionsService: PermissionsService,
    private quotaService: QuotaService,
    private notificationsService: NotificationsService,
    private rolesService: RolesService,
    private i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private logger: Logger,
  ) {
    logger.setContext('AuthService')
    logger.log('AuthService initialized')
  }

  async register(dto: RegisterRequest) {
    const email = dto.email?.toLowerCase()
    const phone = dto.phone
    this.logger.debug('Register attempt', 'AuthService', { email, phone })

    try {
      if (email) {
        const exists = await this.usersRepo.existsBy({ email })
        if (exists) {
          throw new AppConflictException(
            await this.i18n.translate('auth.register.email_exists'),
            'EMAIL_IN_USE',
          )
        }
      }

      const phoneExists = await this.usersRepo.existsBy({ phone })
      if (phoneExists) {
        throw new AppConflictException(
          await this.i18n.translate('auth.register.phone_exists'),
          'PHONE_IN_USE',
        )
      }

      const passwordHash = await this.passwordManager.hashPassword(dto.password)
      const language = (dto.locale ?? dto.language ?? DEFAULT_LOCALE) as User['language']
      const user = this.usersRepo.create({
        name: dto.name,
        email,
        phone,
        passwordHash,
        language,
        preferredPhoneChannel: dto.preferredPhoneChannel ?? PrefferedPhoneChannel.SMS,
        status: UserStatus.PENDING,
        onboardingStep: OnboardingStep.VERIFY_PHONE,
      })
      await this.usersRepo.save(user)

      if (dto.inviteToken) {
        await this.redis.setex(`invite:${user.id}`, 30 * 60, dto.inviteToken)
      }

      const verification = await this.createVerificationCode(
        user.id,
        VerificationChannel.PHONE,
        VerificationPurpose.VERIFY_PHONE,
      )

      this.logger.log('User registered', 'AuthService', { userId: user.id })
      return {
        nextStep: AuthNextStep.VERIFY_PHONE,
        context: this.buildOtpContext(
          VerificationChannel.PHONE,
          verification.expiresAt,
          user.phone,
        ),
        verification: {
          channel: VerificationChannel.PHONE,
          delivery: user.preferredPhoneChannel,
          expiresAt: verification.expiresAt,
          code: this.shouldReturnOtp() ? verification.code : undefined,
        },
      }
    } catch (error) {
      return this.handleServiceError('register', error, { email, phone })
    }
  }

  async login(dto: LoginRequest) {
    this.logger.debug('Login attempt', 'AuthService', { identifier: dto.identifier })

    try {
      const user = await this.findUserByIdentifier(dto.identifier)
      if (!user) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }
      await this.ensureUserActive(user)
      await this.ensureAccountNotLocked(user)
      await this.ensurePhoneVerified(user)
      await this.ensureEmailVerifiedIfRequired(user)

      if (!user.passwordHash) {
        throw new AppBadRequestException(
          await this.i18n.translate('auth.login.password_not_configured'),
          'PASSWORD_NOT_CONFIGURED',
        )
      }

      const valid = await this.passwordManager.verifyPassword(dto.password, user.passwordHash)
      if (!valid) {
        const attempts = (user.failedLoginAttempts ?? 0) + 1
        await this.usersRepo.incrementFailedLoginAttempts(user.id)

        if (attempts >= 10) {
          const lockedUntil = new Date(Date.now() + 60 * 60 * 1000)
          await this.usersRepo.update(user.id, { lockedUntil })
          throw new AppTooManyRequestsException(
            await this.i18n.translate('auth.login.account_locked', {
              args: { time: lockedUntil.toISOString() },
            }),
            'ACCOUNT_LOCKED',
            { lockUntil: lockedUntil.getTime() },
          )
        }

        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
          { attemptsLeft: Math.max(0, 10 - attempts) },
        )
      }

      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null })
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        null,
        null,
        'phase1',
      )
      this.logger.log('User logged in', 'AuthService', { userId: user.id })
      return {
        nextStep: AuthNextStep.SELECT_BUSINESS,
        tokens,
      }
    } catch (error) {
      return this.handleServiceError('login', error, { identifier: dto.identifier })
    }
  }

  async requestLogin(dto: RequestLoginRequest) {
    this.logger.debug('Request login', 'AuthService', { identifier: dto.identifier })

    try {
      const user = await this.findUserByIdentifier(dto.identifier)
      if (!user) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }
      await this.ensureUserActive(user)

      if (dto.preferredOtpChannel && dto.preferredOtpChannel !== user.preferredPhoneChannel) {
        await this.usersRepo.update(user.id, { preferredPhoneChannel: dto.preferredOtpChannel })
        user.preferredPhoneChannel = dto.preferredOtpChannel
      }

      if (!user.isPhoneVerified) {
        const verification = await this.createVerificationCode(
          user.id,
          VerificationChannel.PHONE,
          VerificationPurpose.VERIFY_PHONE,
        )

        return {
          nextStep: AuthNextStep.VERIFY_PHONE,
          context: this.buildOtpContext(
            VerificationChannel.PHONE,
            verification.expiresAt,
            user.phone,
          ),
          verification: {
            channel: VerificationChannel.PHONE,
            delivery: user.preferredPhoneChannel,
            expiresAt: verification.expiresAt,
            code: this.shouldReturnOtp() ? verification.code : undefined,
          },
        }
      }

      if (user.email && !user.isEmailVerified) {
        const verification = await this.createVerificationCode(
          user.id,
          VerificationChannel.EMAIL,
          VerificationPurpose.VERIFY_EMAIL,
        )

        return {
          nextStep: AuthNextStep.VERIFY_EMAIL,
          context: this.buildOtpContext(
            VerificationChannel.EMAIL,
            verification.expiresAt,
            user.email,
          ),
          verification: {
            channel: VerificationChannel.EMAIL,
            expiresAt: verification.expiresAt,
            code: this.shouldReturnOtp() ? verification.code : undefined,
          },
        }
      }

      if (user.passwordHash) {
        return { nextStep: AuthNextStep.PASSWORD_REQUIRED }
      }

      return this.createLoginOtp(user)
    } catch (error) {
      return this.handleServiceError('requestLogin', error, { identifier: dto.identifier })
    }
  }

  async loginWithOtp(identifier: string, code: string) {
    this.logger.debug('Login with OTP attempt', 'AuthService', { identifier })

    try {
      const user = await this.findUserByIdentifier(identifier)
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }

      if (!user.isPhoneVerified) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.verify.phone_not_verified'),
          'PHONE_NOT_VERIFIED',
        )
      }

      await this.ensureEmailVerifiedIfRequired(user)

      await this.verifyCodeOrThrow(
        user.id,
        VerificationChannel.PHONE,
        VerificationPurpose.LOGIN,
        code,
      )

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        null,
        null,
        'phase1',
      )
      this.logger.log('User logged in (otp)', 'AuthService', { userId: user.id })
      return {
        nextStep: AuthNextStep.SELECT_BUSINESS,
        tokens,
      }
    } catch (error) {
      return this.handleServiceError('loginWithOtp', error, { identifier })
    }
  }

  async verifyPhone(phone: string, code: string, inviteToken?: string) {
    this.logger.debug('Verify phone attempt', 'AuthService', { phone })

    try {
      const user = await this.usersRepo.findOne({ where: { phone } })
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }

      await this.verifyCodeOrThrow(
        user.id,
        VerificationChannel.PHONE,
        VerificationPurpose.VERIFY_PHONE,
        code,
      )

      if (!user.isPhoneVerified) {
        await this.usersRepo.update(user.id, {
          isPhoneVerified: true,
          status: user.email ? UserStatus.PHONE_VERIFIED : UserStatus.ACTIVE,
          onboardingStep: user.email ? OnboardingStep.VERIFY_EMAIL : OnboardingStep.SELECT_PLAN,
        })
      }
      user.isPhoneVerified = true
      user.status = user.email ? UserStatus.PHONE_VERIFIED : UserStatus.ACTIVE
      user.onboardingStep = user.email ? OnboardingStep.VERIFY_EMAIL : OnboardingStep.SELECT_PLAN

      if (user.email && !user.isEmailVerified) {
        const verification = await this.createVerificationCode(
          user.id,
          VerificationChannel.EMAIL,
          VerificationPurpose.VERIFY_EMAIL,
        )

        return {
          nextStep: AuthNextStep.VERIFY_EMAIL,
          context: this.buildOtpContext(
            VerificationChannel.EMAIL,
            verification.expiresAt,
            user.email,
          ),
          verification: {
            channel: VerificationChannel.EMAIL,
            expiresAt: verification.expiresAt,
            code: this.shouldReturnOtp() ? verification.code : undefined,
          },
        }
      }

      return this.completeRegistration(user, inviteToken)
    } catch (error) {
      return this.handleServiceError('verifyPhone', error, { phone })
    }
  }

  async verifyEmail(email: string, code: string, inviteToken?: string) {
    this.logger.debug('Verify email attempt', 'AuthService', { email })

    try {
      const user = await this.usersRepo.findOne({ where: { email } })
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }

      await this.verifyCodeOrThrow(
        user.id,
        VerificationChannel.EMAIL,
        VerificationPurpose.VERIFY_EMAIL,
        code,
      )

      if (!user.isEmailVerified) {
        await this.usersRepo.update(user.id, {
          isEmailVerified: true,
          status: UserStatus.ACTIVE,
          onboardingStep: user.onboardingStep,
        })
      }
      user.isEmailVerified = true
      user.status = UserStatus.ACTIVE

      await this.ensurePhoneVerified(user)

      if (user.onboardingStep === OnboardingStep.VERIFY_EMAIL) {
        return this.completeRegistration(user, inviteToken)
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        null,
        null,
        'phase1',
      )

      return {
        nextStep: AuthNextStep.SELECT_BUSINESS,
        tokens,
      }
    } catch (error) {
      return this.handleServiceError('verifyEmail', error, { email })
    }
  }

  async resendOtp(dto: ResendOtpRequest) {
    this.logger.debug('Resend OTP', 'AuthService', { identifier: dto.identifier, type: dto.type })

    try {
      const user = await this.findUserByIdentifier(dto.identifier)
      if (!user) {
        throw new AppNotFoundException(
          await this.i18n.translate('auth.login.user_not_found'),
          'USER_NOT_FOUND',
          { nextStep: AuthNextStep.REGISTER },
        )
      }

      await this.ensureUserActive(user)

      if (dto.channel && dto.channel !== user.preferredPhoneChannel) {
        await this.usersRepo.update(user.id, { preferredPhoneChannel: dto.channel })
        user.preferredPhoneChannel = dto.channel
      }

      if (dto.type === OtpType.VERIFY_EMAIL) {
        if (!user.email) {
          throw new AppBadRequestException(
            await this.i18n.translate('auth.verify.email_not_configured'),
            'EMAIL_NOT_CONFIGURED',
          )
        }
        const verification = await this.createVerificationCode(
          user.id,
          VerificationChannel.EMAIL,
          VerificationPurpose.VERIFY_EMAIL,
        )
        return {
          nextStep: AuthNextStep.VERIFY_EMAIL,
          context: this.buildOtpContext(
            VerificationChannel.EMAIL,
            verification.expiresAt,
            user.email,
          ),
          verification: {
            channel: VerificationChannel.EMAIL,
            expiresAt: verification.expiresAt,
            code: this.shouldReturnOtp() ? verification.code : undefined,
          },
        }
      }

      const purpose =
        dto.type === OtpType.LOGIN ? VerificationPurpose.LOGIN : VerificationPurpose.VERIFY_PHONE
      const verification = await this.createVerificationCode(
        user.id,
        VerificationChannel.PHONE,
        purpose,
      )
      const nextStep =
        dto.type === OtpType.LOGIN ? AuthNextStep.CONFIRM_LOGIN : AuthNextStep.VERIFY_PHONE

      return {
        nextStep,
        context: this.buildOtpContext(
          VerificationChannel.PHONE,
          verification.expiresAt,
          user.phone,
        ),
        verification: {
          channel: VerificationChannel.PHONE,
          delivery: user.preferredPhoneChannel,
          expiresAt: verification.expiresAt,
          code: this.shouldReturnOtp() ? verification.code : undefined,
        },
      }
    } catch (error) {
      return this.handleServiceError('resendOtp', error, {
        identifier: dto.identifier,
        type: dto.type,
      })
    }
  }

  async refreshTokens(refreshToken: string) {
    this.logger.debug('Refresh tokens attempt', 'AuthService')

    try {
      const { tokenId } = await this.parseRefreshToken(refreshToken)
      const stored = await this.refreshTokensRepo.findOne({
        where: { tokenId },
        relations: ['user'],
      })

      if (!stored || stored.expiresAt < new Date()) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.token.invalid'),
          'INVALID_REFRESH_TOKEN',
        )
      }

      if (stored.revokedAt) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.token.invalid'),
          'INVALID_REFRESH_TOKEN',
        )
      }

      if (stored.usedAt) {
        await this.refreshTokensRepo.updateByFamilyId(stored.familyId, { revokedAt: new Date() })
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.token.invalid'),
          'INVALID_REFRESH_TOKEN',
        )
      }

      const valid = await this.passwordManager.verifyToken(refreshToken, stored.tokenHash)
      if (!valid) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.token.invalid'),
          'INVALID_REFRESH_TOKEN',
        )
      }

      await this.refreshTokensRepo.update(stored.id, { usedAt: new Date() })

      const businessId = stored.businessId ?? null
      const tokenType = stored.tokenType ?? 'phase2'

      if (tokenType === 'phase1' || !businessId) {
        const tokens = await this.generateTokens(
          stored.user!.id,
          stored.user!.email ?? undefined,
          stored.user!.phone ?? undefined,
          null,
          null,
          'phase1',
          stored.familyId,
        )
        return { tokens }
      }

      const membership = await this.businessMembersRepo.findOne({
        where: { userId: stored.user!.id, businessId, status: BusinessMemberStatus.ACTIVE },
      })
      if (!membership) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.token.invalid'),
          'INVALID_REFRESH_TOKEN',
        )
      }

      const tokens = await this.generateTokens(
        stored.user!.id,
        stored.user!.email ?? undefined,
        stored.user!.phone ?? undefined,
        membership.role,
        businessId,
        'phase2',
        stored.familyId,
        membership.roleId,
      )
      return { tokens }
    } catch (error) {
      return this.handleServiceError('refreshTokens', error)
    }
  }

  async logout(userId: string, refreshToken?: string): Promise<LogoutResponse> {
    this.logger.debug('Logout attempt', 'AuthService', { userId })

    try {
      if (refreshToken) {
        const { tokenId } = await this.parseRefreshToken(refreshToken)
        await this.refreshTokensRepo.updateByTokenId(tokenId, { revokedAt: new Date() })
      } else {
        await this.refreshTokensRepo.updateByUserId(userId, { revokedAt: new Date() })
      }

      return { status: 'logged_out' } satisfies LogoutResponse
    } catch (error) {
      return this.handleServiceError('logout', error, { userId })
    }
  }

  async selectBusiness(userId: string, businessId: string) {
    this.logger.debug('Select business', 'AuthService', { userId, businessId })

    try {
      const [user, business, membership] = await Promise.all([
        this.usersRepo.findOne({ where: { id: userId } }),
        this.businessesRepo.findOne({ where: { id: businessId } }),
        this.businessMembersRepo.findOne({ where: { userId, businessId } }),
      ])

      if (!user || !user.isActive) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }
      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }
      if (!membership) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'BUSINESS_FORBIDDEN',
        )
      }

      if (membership.status === BusinessMemberStatus.REMOVED) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'BUSINESS_FORBIDDEN',
        )
      }

      if (membership.status === BusinessMemberStatus.PENDING) {
        await this.businessMembersRepo.update(membership.id, {
          status: BusinessMemberStatus.ACTIVE,
        })
        membership.status = BusinessMemberStatus.ACTIVE
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        membership.role,
        businessId,
        'phase2',
        undefined,
        membership.roleId,
      )
      const authPermissions = await this.getAuthPermissions(businessId)

      const nextStep = this.resolveBusinessNextStep(membership.role, business.businessStatus)

      return { nextStep, tokens, authPermissions }
    } catch (error) {
      return this.handleServiceError('selectBusiness', error, { userId, businessId })
    }
  }

  async getInvitePreview(token: string) {
    this.logger.debug('Invite preview', 'AuthService', { token })

    try {
      if (!token) {
        throw new AppBadRequestException('errors.invite_invalid', 'INVITE_INVALID')
      }

      const invite = await this.pendingInvitesRepo.findOne({
        where: { token },
        order: { createdAt: 'DESC' },
      })

      if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
        throw new AppNotFoundException('errors.invite_invalid', 'INVITE_INVALID')
      }

      const business = await this.businessesRepo.findOne({
        where: { id: invite.businessId },
        select: { id: true, name: true },
      } as any)

      if (!business) {
        throw new AppNotFoundException('errors.invite_invalid', 'INVITE_INVALID')
      }

      const invitedBy = invite.invitedById
        ? await this.usersRepo.findOne({
          where: { id: invite.invitedById },
          select: { id: true, name: true },
        } as any)
        : null

      const sentTo = invite.phone
        ? this.maskPhone(invite.phone)
        : invite.email
          ? this.maskEmail(invite.email)
          : null

      return {
        businessName: business.name,
        role: invite.role,
        invitedByName: invitedBy?.name ?? null,
        expiresAt: invite.expiresAt,
        sentTo,
        email: invite.email ?? null,
        phone: invite.phone ?? null,
      }
    } catch (error) {
      return this.handleServiceError('getInvitePreview', error, { token })
    }
  }

  async sendInvite(userId: string, businessId: string, dto: SendInviteRequest) {
    this.logger.debug('Send invite', 'AuthService', { userId, businessId, roleId: dto.roleId })

    try {
      const inviter = await this.businessMembersRepo.findOne({
        where: { userId, businessId, status: BusinessMemberStatus.ACTIVE },
      })
      if (!inviter || inviter.role !== BusinessMemberRole.OWNER) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'BUSINESS_FORBIDDEN',
        )
      }

      // Validate & look up the requested role
      const inviteRole = await this.rolesService.findByIdOrFail(dto.roleId, businessId)
      if (inviteRole.isOwnerRole) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'BUSINESS_FORBIDDEN',
        )
      }
      const enumRole = RolesService.toMemberRoleEnum(inviteRole.name)

      const email = dto.email?.toLowerCase() ?? null
      const phone = dto.phone ?? null
      if (!email && !phone) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.invite_contact_required'),
          'INVITE_CONTACT_REQUIRED',
        )
      }

      let existingUser: User | null = null
      if (email) {
        existingUser = await this.usersRepo.findOne({ where: { email } })
      }
      if (!existingUser && phone) {
        existingUser = await this.usersRepo.findOne({ where: { phone } })
      }

      if (existingUser) {
        const membership = await this.businessMembersRepo.findOne({
          where: { userId: existingUser.id, businessId },
        })

        if (membership?.status === BusinessMemberStatus.ACTIVE) {
          throw new AppConflictException(
            await this.i18n.translate('errors.invite_already_member'),
            'INVITE_ALREADY_MEMBER',
          )
        }

        if (membership?.status === BusinessMemberStatus.PENDING) {
          throw new AppConflictException(
            await this.i18n.translate('errors.invite_already_pending'),
            'INVITE_ALREADY_PENDING',
          )
        }

        if (membership) {
          await this.businessMembersRepo.update(membership.id, {
            status: BusinessMemberStatus.PENDING,
            role: enumRole,
            roleId: inviteRole.id,
          })
        } else {
          const newMember = this.businessMembersRepo.create({
            businessId,
            userId: existingUser.id,
            role: enumRole,
            roleId: inviteRole.id,
            status: BusinessMemberStatus.PENDING,
          })
          await this.businessMembersRepo.save(newMember)
        }

        return {
          status: 'pending_member',
          businessId,
          userId: existingUser.id,
          inviteUrl: null,
        }
      }

      const token = uuidv4()
      const expiresAt = new Date(Date.now() + this.getInviteTtlDays() * 24 * 60 * 60 * 1000)
      const invite = this.pendingInvitesRepo.create({
        token,
        businessId,
        role: enumRole,
        roleId: inviteRole.id,
        phone,
        email,
        invitedById: userId,
        expiresAt,
      })
      await this.pendingInvitesRepo.save(invite)

      // Enqueue invite notifications — processor handles all channel logic asynchronously
      const business = await this.businessesRepo.findOne({ where: { id: businessId } })
      const inviterUser = await this.usersRepo.findOne({ where: { id: userId } })
      void this.notificationsService.enqueueInviteNotifications(
        invite.id,
        business?.name ?? 'BizTrack',
        inviterUser?.name ?? undefined,
      )

      const appUrl = this.config.get<string>('APP_URL', { infer: true }) ?? ''
      const inviteUrl = `${appUrl}/en/invite?token=${token}`

      return {
        status: 'pending_invite',
        token,
        expiresAt,
        inviteUrl,
      }
    } catch (error) {
      return this.handleServiceError('sendInvite', error, { userId, businessId })
    }
  }

  async acceptInvite(userId: string, token: string) {
    this.logger.debug('Accept invite', 'AuthService', { userId, token })

    try {
      const invite = await this.pendingInvitesRepo.findOne({
        where: { token },
        order: { createdAt: 'DESC' },
      })
      if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
        throw new AppNotFoundException('errors.invite_invalid', 'INVITE_INVALID')
      }

      const user = await this.usersRepo.findOne({ where: { id: userId } })
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }

      const matchesContact =
        (invite.phone && invite.phone === user.phone) ||
        (invite.email && invite.email === user.email)
      if (!matchesContact) {
        throw new AppForbiddenException('errors.invite_invalid', 'INVITE_INVALID')
      }

      const existing = await this.businessMembersRepo.findOne({
        where: { userId, businessId: invite.businessId },
      })

      if (existing?.status === BusinessMemberStatus.ACTIVE) {
        throw new AppConflictException(
          await this.i18n.translate('errors.invite_already_member'),
          'INVITE_ALREADY_MEMBER',
        )
      }

      if (existing) {
        // Accepting an invite is the moment a seat becomes active. Pending
        // invites are intentionally free in v1, so the quota check belongs
        // here rather than in `sendInvite`.
        await this.quotaService.assertWithinQuota(invite.businessId, 'users')
        await this.businessMembersRepo.update(existing.id, {
          status: BusinessMemberStatus.ACTIVE,
          role: invite.role ?? BusinessMemberRole.CASHIER,
          roleId: invite.roleId,
        })
      } else {
        await this.quotaService.assertWithinQuota(invite.businessId, 'users')
        const member = this.businessMembersRepo.create({
          businessId: invite.businessId,
          userId,
          role: invite.role ?? BusinessMemberRole.CASHIER,
          roleId: invite.roleId,
          status: BusinessMemberStatus.ACTIVE,
        })
        await this.businessMembersRepo.save(member)
      }

      await this.pendingInvitesRepo.update(invite.id, { acceptedAt: new Date() })

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        invite.role ?? BusinessMemberRole.CASHIER,
        invite.businessId,
        'phase2',
        undefined,
        invite.roleId,
      )
      const authPermissions = await this.getAuthPermissions(invite.businessId)

      const business = await this.businessesRepo.findOne({ where: { id: invite.businessId } })
      const nextStep = this.resolveBusinessNextStep(invite.role ?? BusinessMemberRole.CASHIER, business?.businessStatus ?? null)

      return { nextStep, tokens, authPermissions }
    } catch (error) {
      return this.handleServiceError('acceptInvite', error, { userId, token })
    }
  }

  async rejectInvite(userId: string, token: string) {
    this.logger.debug('Reject invite', 'AuthService', { userId, token })

    try {
      const invite = await this.pendingInvitesRepo.findOne({
        where: { token },
        order: { createdAt: 'DESC' },
      })
      if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
        throw new AppNotFoundException('errors.invite_invalid', 'INVITE_INVALID')
      }

      const user = await this.usersRepo.findOne({ where: { id: userId } })
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException(
          await this.i18n.translate('auth.login.invalid_credentials'),
          'INVALID_CREDENTIALS',
        )
      }

      const matchesContact =
        (invite.phone && invite.phone === user.phone) ||
        (invite.email && invite.email === user.email)
      if (!matchesContact) {
        throw new AppForbiddenException('errors.invite_invalid', 'INVITE_INVALID')
      }

      const membership = await this.businessMembersRepo.findOne({
        where: { userId, businessId: invite.businessId },
      })
      if (membership && membership.status !== BusinessMemberStatus.REMOVED) {
        await this.businessMembersRepo.update(membership.id, {
          status: BusinessMemberStatus.REMOVED,
        })
      }

      await this.pendingInvitesRepo.delete(invite.id)
      return { status: 'rejected' }
    } catch (error) {
      return this.handleServiceError('rejectInvite', error, { userId, token })
    }
  }

  async listPendingInvites(businessId: string) {
    this.logger.debug('List pending invites', 'AuthService', { businessId })

    try {
      const invites = await this.pendingInvitesRepo.find({
        where: { businessId, acceptedAt: IsNull() },
        relations: ['roleRecord'],
        order: { createdAt: 'DESC' },
      })

      const now = new Date()
      return {
        invites: invites.map((invite) => ({
          id: invite.id,
          roleId: invite.roleId ?? '',
          roleName: invite.roleRecord?.name ?? invite.role ?? '',
          role: invite.role ?? null,
          phone: invite.phone ?? null,
          email: invite.email ?? null,
          status: (invite.expiresAt < now ? 'expired' : 'pending') as 'expired' | 'pending',
          expiresAt: invite.expiresAt.toISOString(),
          createdAt: invite.createdAt.toISOString(),
        })),
      }
    } catch (error) {
      return this.handleServiceError('listPendingInvites', error, { businessId })
    }
  }

  async resendInvite(userId: string, businessId: string, inviteId: string) {
    this.logger.debug('Resend invite', 'AuthService', { userId, businessId, inviteId })

    try {
      const requester = await this.businessMembersRepo.findOne({
        where: { businessId, userId, status: BusinessMemberStatus.ACTIVE },
      })
      if (!requester || (requester.role !== BusinessMemberRole.OWNER && requester.role !== BusinessMemberRole.MANAGER)) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      const invite = await this.pendingInvitesRepo.findOne({
        where: { id: inviteId, businessId, acceptedAt: IsNull() },
      })
      if (!invite) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.not_found'),
          'NOT_FOUND',
        )
      }

      const newExpiry = new Date()
      newExpiry.setDate(newExpiry.getDate() + 7)
      await this.pendingInvitesRepo.update(invite.id, { expiresAt: newExpiry })

      const appUrl = this.config.get<string>('APP_URL', { infer: true }) ?? ''
      const inviteUrl = invite.token ? `${appUrl}/en/invite?token=${invite.token}` : null
      return { resent: true, inviteUrl }
    } catch (error) {
      return this.handleServiceError('resendInvite', error, { userId, businessId, inviteId })
    }
  }

  async cancelInvite(userId: string, businessId: string, inviteId: string) {
    this.logger.debug('Cancel invite', 'AuthService', { userId, businessId, inviteId })

    try {
      const requester = await this.businessMembersRepo.findOne({
        where: { businessId, userId, status: BusinessMemberStatus.ACTIVE },
      })
      if (!requester || (requester.role !== BusinessMemberRole.OWNER && requester.role !== BusinessMemberRole.MANAGER)) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      const invite = await this.pendingInvitesRepo.findOne({
        where: { id: inviteId, businessId },
      })
      if (!invite) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.not_found'),
          'NOT_FOUND',
        )
      }

      await this.pendingInvitesRepo.delete(invite.id)
      return { cancelled: true }
    } catch (error) {
      return this.handleServiceError('cancelInvite', error, { userId, businessId, inviteId })
    }
  }

  private async generateTokens(
    userId: string,
    email: string | undefined,
    phone: string | undefined,
    role: BusinessMemberRole | null,
    businessId: string | null,
    tokenType: 'phase1' | 'phase2',
    familyId?: string,
    roleId?: string | null,
  ) {
    const payload: JwtPayload = {
      sub: userId,
      email,
      phone,
      role: role ?? null,
      roleId: roleId ?? null,
      isOwner: role === BusinessMemberRole.OWNER,
      businessId,
      type: tokenType,
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload),
      this.generateRefreshToken(userId, familyId, businessId, tokenType),
    ])

    return { accessToken, refreshToken }
  }

  private async generateRefreshToken(
    userId: string,
    familyId: string | undefined,
    businessId: string | null,
    tokenType: 'phase1' | 'phase2',
  ): Promise<string> {
    const tokenId = uuidv4()
    const secret = uuidv4().replace(/-/g, '')
    const rawToken = `${tokenId}.${secret}`
    const tokenHash = await this.passwordManager.hashToken(rawToken)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const refreshToken = this.refreshTokensRepo.create({
      tokenId,
      tokenHash,
      familyId: familyId ?? uuidv4(),
      userId,
      businessId: businessId ?? null,
      tokenType,
      expiresAt,
    })
    await this.refreshTokensRepo.save(refreshToken)
    return rawToken
  }

  private async createVerificationCode(
    userId: string,
    channel: VerificationChannel,
    purpose: VerificationPurpose,
  ) {
    await this.verificationCodesRepo.delete({ userId, channel, purpose, usedAt: IsNull() })

    const code = this.generateOtp()
    const codeHash = await this.passwordManager.hashOtp(code)
    const expiresAt = new Date(Date.now() + this.getOtpTtlMinutes() * 60 * 1000)

    const record = this.verificationCodesRepo.create({
      userId,
      channel,
      purpose,
      codeHash,
      expiresAt,
    })
    await this.verificationCodesRepo.save(record)

    return { code, expiresAt }
  }

  private async verifyCodeOrThrow(
    userId: string,
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    code: string,
  ) {
    const record = await this.verificationCodesRepo.findOne({
      where: { userId, channel, purpose, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    })

    if (!record || record.expiresAt < new Date()) {
      throw new AppBadRequestException(
        await this.i18n.translate('auth.otp.expired'),
        'INVALID_CODE',
        { nextStep: AuthNextStep.REQUEST_NEW_OTP },
      )
    }

    const attempts = record.attempts + 1
    await this.verificationCodesRepo.incrementAttempts(record.id)

    if (attempts >= 5) {
      throw new AppTooManyRequestsException(
        await this.i18n.translate('auth.otp.max_attempts'),
        'OTP_LOCKED',
        {
          nextStep: AuthNextStep.REQUEST_NEW_OTP,
          lockUntil: record.expiresAt.getTime(),
        },
      )
    }

    const valid = await this.passwordManager.verifyOtp(code, record.codeHash)
    if (!valid) {
      console.log('not valid code')
      throw new AppBadRequestException(
        await this.i18n.translate('auth.otp.invalid'),
        'INVALID_CODE',
        { attemptsLeft: Math.max(0, 5 - attempts) },
      )
    }

    await this.verificationCodesRepo.update(record.id, { usedAt: new Date() })
  }

  private generateOtp(): string {
    if (this.config.get('NODE_ENV', { infer: true }) !== NodeEnv.PRODUCTION) {
      return '000000'
    }
    return String(randomInt(100000, 999999))
  }

  private getOtpTtlMinutes(): number {
    return this.config.get('OTP_TTL_MINUTES', { infer: true }) || 10
  }

  private getInviteTtlDays(): number {
    return this.config.get('INVITE_TTL_DAYS', { infer: true }) || 7
  }

  private shouldReturnOtp(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) !== NodeEnv.PRODUCTION
  }

  private async createLoginOtp(user: User) {
    const verification = await this.createVerificationCode(
      user.id,
      VerificationChannel.PHONE,
      VerificationPurpose.LOGIN,
    )

    return {
      nextStep: AuthNextStep.CONFIRM_LOGIN,
      context: this.buildOtpContext(VerificationChannel.PHONE, verification.expiresAt, user.phone),
      verification: {
        channel: VerificationChannel.PHONE,
        delivery: user.preferredPhoneChannel,
        expiresAt: verification.expiresAt,
        code: this.shouldReturnOtp() ? verification.code : undefined,
      },
    }
  }

  private async completeRegistration(user: User, inviteToken?: string) {
    const storedToken = await this.redis.get(`invite:${user.id}`)
    const token = inviteToken ?? storedToken ?? null
    const tokenMismatch = storedToken && inviteToken && storedToken !== inviteToken

    const invite =
      token && !tokenMismatch
        ? await this.pendingInvitesRepo.findOne({ where: { token }, order: { createdAt: 'DESC' } })
        : null

    const inviteValid =
      invite &&
      !invite.acceptedAt &&
      invite.expiresAt > new Date() &&
      ((invite.phone && invite.phone === user.phone) ||
        (invite.email && invite.email === user.email))

    if (inviteValid) {
      await this.quotaService.assertWithinQuota(invite!.businessId, 'users')
      const member = this.businessMembersRepo.create({
        businessId: invite!.businessId,
        userId: user.id,
        role: invite!.role ?? BusinessMemberRole.CASHIER,
        roleId: invite!.roleId,
        status: BusinessMemberStatus.ACTIVE,
      })
      await this.businessMembersRepo.save(member)
      await this.pendingInvitesRepo.update(invite!.id, { acceptedAt: new Date() })
      await this.usersRepo.update(user.id, { onboardingStep: OnboardingStep.COMPLETE })

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        member.role,
        member.businessId,
        'phase2',
      )
      const authPermissions = await this.getAuthPermissions(member.businessId)

      return {
        nextStep: AuthNextStep.DASHBOARD,
        tokens,
        authPermissions,
      }
    }

    const business = await this.createDefaultBusiness(user)
    const member = this.businessMembersRepo.create({
      businessId: business.id,
      userId: user.id,
      role: BusinessMemberRole.OWNER,
      status: BusinessMemberStatus.ACTIVE,
    })
    await this.businessMembersRepo.save(member)
    await this.usersRepo.update(user.id, { onboardingStep: OnboardingStep.SETUP_BUSINESS })

    const tokens = await this.generateTokens(
      user.id,
      user.email ?? undefined,
      user.phone ?? undefined,
      member.role,
      business.id,
      'phase2',
    )
    const authPermissions = await this.getAuthPermissions(business.id)

    return {
      nextStep: AuthNextStep.SETUP_BUSINESS,
      tokens,
      authPermissions,
    }
  }

  private async createDefaultBusiness(user: User) {
    const name = `${user.name}'s Business`
    const baseSlug = generateSlug(name)
    const slug = await this.generateUniqueSlug(baseSlug)

    const business = this.businessesRepo.create({
      name,
      slug,
      ownerId: user.id,
      businessStatus: BusinessStatus.ONBOARDING,
    })

    return this.businessesRepo.save(business)
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    let slug = base
    let counter = 1
    while (await this.businessesRepo.findOne({ where: { slug } })) {
      slug = `${base}-${counter++}`
    }
    return slug
  }

  private resolveBusinessNextStep(role: BusinessMemberRole, status: BusinessStatus | null) {
    if (role !== BusinessMemberRole.OWNER) {
      return AuthNextStep.DASHBOARD
    }
    if (status === BusinessStatus.ONBOARDING) return AuthNextStep.SETUP_BUSINESS
    if (status === BusinessStatus.PLAN_PENDING) return AuthNextStep.SELECT_PLAN
    return AuthNextStep.DASHBOARD
  }

  private async findUserByIdentifier(identifier?: string): Promise<User | null> {
    if (!identifier) {
      throw new AppBadRequestException(
        await this.i18n.translate('auth.login.identifier_required'),
        'LOGIN_IDENTIFIER_REQUIRED',
      )
    }

    const lookup = identifier.toLowerCase().trim()
    const isEmail = lookup.includes('@')
    return isEmail
      ? await this.usersRepo.findOne({ where: { email: lookup } })
      : await this.usersRepo.findOne({ where: { phone: lookup } })
  }

  private async ensureUserActive(user: User) {
    if (!user.isActive) {
      throw new AppUnauthorizedException(
        await this.i18n.translate('auth.login.account_deactivated'),
        'ACCOUNT_DEACTIVATED',
      )
    }
  }

  private async ensurePhoneVerified(user: User) {
    if (!user.isPhoneVerified) {
      throw new AppUnauthorizedException(
        await this.i18n.translate('auth.verify.phone_not_verified'),
        'PHONE_NOT_VERIFIED',
      )
    }
  }

  private async ensureEmailVerifiedIfRequired(user: User) {
    if (user.email && !user.isEmailVerified) {
      throw new AppUnauthorizedException(
        await this.i18n.translate('auth.verify.email_not_verified'),
        'EMAIL_NOT_VERIFIED',
      )
    }
  }

  private async ensureAccountNotLocked(user: User) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppTooManyRequestsException(
        await this.i18n.translate('auth.login.account_locked', {
          args: { time: user.lockedUntil.toISOString() },
        }),
        'ACCOUNT_LOCKED',
        { lockUntil: user.lockedUntil.getTime() },
      )
    }
  }

  private resolveNextStep(step: OnboardingStep): AuthNextStep {
    switch (step) {
      case OnboardingStep.SELECT_PLAN:
        return AuthNextStep.SELECT_PLAN
      case OnboardingStep.SETUP_BUSINESS:
        return AuthNextStep.SETUP_BUSINESS
      case OnboardingStep.ADD_FIRST_PRODUCT:
        return AuthNextStep.ADD_FIRST_PRODUCT
      case OnboardingStep.COMPLETE:
        return AuthNextStep.DASHBOARD
      case OnboardingStep.VERIFY_EMAIL:
        return AuthNextStep.VERIFY_EMAIL
      case OnboardingStep.VERIFY_PHONE:
      default:
        return AuthNextStep.VERIFY_PHONE
    }
  }

  private async getAuthPermissions(businessId?: string | null): Promise<AuthPermissions> {
    if (!businessId) {
      return {
        plan: null,
        effectivePermissions: [],
        specialPermissions: [],
        permissionsIssuedAt: Date.now(),
        permissionsExpiresAt: null,
      }
    }
    return this.permissionsService.buildAuthPermissions(businessId)
  }

  private buildOtpContext(
    channel: VerificationChannel,
    expiresAt: Date,
    identifier?: string | null,
  ): AuthContext {
    const context: AuthContext = {
      otpChannel: channel,
      otpExpiresIn: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    }

    if (identifier) {
      if (channel === VerificationChannel.EMAIL) {
        context.maskedEmail = this.maskEmail(identifier)
      } else {
        context.maskedPhone = this.maskPhone(identifier)
      }
    }

    return context
  }

  private maskPhone(phone: string): string {
    if (phone.length < 6) return phone
    return `${phone.slice(0, 4)} ${phone.slice(4, 5)}XX XXX X${phone.slice(-2)}`
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@')
    if (!domain) return email
    const prefix = (name || '').slice(0, 1)
    return `${prefix}***@${domain}`
  }

  private async parseRefreshToken(raw: string): Promise<{ tokenId: string }> {
    const [tokenId] = raw.split('.')
    if (!tokenId) {
      throw new AppUnauthorizedException(
        await this.i18n.translate('auth.token.invalid'),
        'INVALID_REFRESH_TOKEN',
      )
    }
    return { tokenId }
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('AuthService error', 'AuthService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('AuthService unexpected error', 'AuthService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'AUTH_SERVICE_ERROR',
      { action },
    )
  }
}
