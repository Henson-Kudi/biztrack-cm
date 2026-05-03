/// <reference types="jest" />
import { AppUnauthorizedException } from '@/common/exceptions/app-exceptions'
import { VerificationPurpose } from '@/entities/verification-code.entity'
import { OnboardingStep, User, UserStatus } from '@/entities/user.entity'
import { AuthNextStep, PrefferedPhoneChannel, UserRole, VerificationChannel } from '@biztrack/types'
import { NodeEnv } from '@/config/configuration'
import { AuthService } from '../auth.service'

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: null,
    phone: '+237612345678',
    name: 'Test User',
    passwordHash: null,
    avatarUrl: null,
    role: UserRole.OWNER,
    language: 'en',
    isEmailVerified: false,
    isPhoneVerified: false,
    status: UserStatus.PENDING,
    onboardingStep: OnboardingStep.VERIFY_PHONE,
    failedLoginAttempts: 0,
    lockedUntil: null,
    preferredPhoneChannel: PrefferedPhoneChannel.SMS,
    isActive: true,
    businessId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User

const makeVerificationRecord = () => ({
  id: 'verif-1',
  codeHash: 'hash',
  attempts: 0,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
})

const makeService = () => {
  const usersRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    existsBy: jest.fn(),
    incrementFailedLoginAttempts: jest.fn(),
  }
  const refreshTokensRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    updateByFamilyId: jest.fn(),
    updateByTokenId: jest.fn(),
    updateByUserId: jest.fn(),
  }
  const verificationCodesRepo = {
    delete: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    incrementAttempts: jest.fn(),
  }
  const businessMembersRepo = {
    findOne: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(),
    update: jest.fn(),
  }
  const pendingInvitesRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  }
  const businessesRepo = {
    findOne: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'business-1', ...input })),
  }
  const redis = {
    setex: jest.fn(),
    get: jest.fn(),
  }
  const jwt = { signAsync: jest.fn() }
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'OTP_TTL_MINUTES') return 10
      if (key === 'NODE_ENV') return NodeEnv.DEVELOPMENT
      return undefined
    }),
  }
  const passwordManager = {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    hashOtp: jest.fn().mockResolvedValue('hash'),
    verifyOtp: jest.fn().mockResolvedValue(true),
    hashToken: jest.fn().mockResolvedValue('hash'),
    verifyToken: jest.fn().mockResolvedValue(true),
  }
  const logger = {
    setContext: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
  const permissionsService = {
    invalidateCache: jest.fn(),
    buildAuthPermissions: jest.fn().mockResolvedValue({ permissions: [] }),
  };
  const i18n = {
    translate: jest.fn(async (key: string) => key),
  }

  const service = new AuthService(
    usersRepo as any,
    refreshTokensRepo as any,
    verificationCodesRepo as any,
    businessMembersRepo as any,
    pendingInvitesRepo as any,
    businessesRepo as any,
    redis as any,
    jwt as any,
    config as any,
    passwordManager as any,
    permissionsService as any,
    i18n as any,
    logger as any,
  )

  jest.spyOn(service as any, 'generateTokens').mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  })

  return {
    service,
    usersRepo,
    refreshTokensRepo,
    verificationCodesRepo,
    passwordManager,
  }
}

describe('AuthService flow', () => {
  describe('requestLogin', () => {
    it('returns verify_phone when phone is not verified', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({ isPhoneVerified: false })
      usersRepo.findOne.mockResolvedValue(user)

      const result = await service.requestLogin({ identifier: user.phone })

      expect(result.nextStep).toBe(AuthNextStep.VERIFY_PHONE)
      expect(result?.verification?.channel).toBe(VerificationChannel.PHONE)
      expect((result as any)?.verification?.delivery).toBe(user.preferredPhoneChannel)
      expect(verificationCodesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          channel: VerificationChannel.PHONE,
          purpose: VerificationPurpose.VERIFY_PHONE,
        }),
      )
    })

    it('returns password_required when password exists and checks are satisfied', async () => {
      const { service, usersRepo } = makeService()
      const user = makeUser({
        isPhoneVerified: true,
        isEmailVerified: true,
        passwordHash: 'hash',
      })
      usersRepo.findOne.mockResolvedValue(user)

      const result = await service.requestLogin({ identifier: user.phone })

      expect(result).toEqual({ nextStep: AuthNextStep.PASSWORD_REQUIRED })
    })

    it('sends login OTP when no password is configured', async () => {
      const { service, usersRepo } = makeService()
      const user = makeUser({ isPhoneVerified: true, isEmailVerified: true, passwordHash: null })
      usersRepo.findOne.mockResolvedValue(user)

      const result = await service.requestLogin({ identifier: user.phone })

      expect(result.nextStep).toBe(AuthNextStep.CONFIRM_LOGIN)
      if (result.nextStep === AuthNextStep.CONFIRM_LOGIN) {
        expect((result as any).verification.channel).toBe(VerificationChannel.PHONE)
        expect((result as any).verification.delivery).toBe(user.preferredPhoneChannel)
      }
    })
  })

  describe('verifyPhone', () => {
    it('sends email verification when email exists and is not verified', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({ email: 'user@example.com', isEmailVerified: false, isPhoneVerified: false })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyPhone(user.phone, '123456')

      expect(usersRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ isPhoneVerified: true, onboardingStep: OnboardingStep.VERIFY_EMAIL }),
      )
      expect(result.nextStep).toBe(AuthNextStep.VERIFY_EMAIL)
      expect((result as any)?.verification?.channel).toBe(VerificationChannel.EMAIL)
    })

    it('returns onboarding next step when email is verified', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        isPhoneVerified: false,
        isEmailVerified: true,
        passwordHash: 'hash',
        onboardingStep: OnboardingStep.SELECT_PLAN,
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyPhone(user.phone, '123456')

      expect(result.nextStep).toBe(AuthNextStep.SETUP_BUSINESS)
      expect((result as any).tokens).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })

    it('returns onboarding next step when no password is configured', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        isPhoneVerified: false,
        isEmailVerified: true,
        passwordHash: null,
        onboardingStep: OnboardingStep.SELECT_PLAN,
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyPhone(user.phone, '123456')

      expect(result.nextStep).toBe(AuthNextStep.SETUP_BUSINESS)
      expect((result as any).tokens).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })
  })

  describe('verifyEmail', () => {
    it('requires phone to be verified first', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({ email: 'user@example.com', isPhoneVerified: false })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      await expect(service.verifyEmail(user.email!, '123456')).rejects.toMatchObject<AppUnauthorizedException>({
        code: 'PHONE_NOT_VERIFIED',
      } as any)
    })

    it('returns onboarding next step after verification', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        email: 'user@example.com',
        isPhoneVerified: true,
        passwordHash: 'hash',
        onboardingStep: OnboardingStep.SELECT_PLAN,
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyEmail(user.email!, '123456')

      expect(result.nextStep).toBe(AuthNextStep.SELECT_BUSINESS)
      expect((result as any).tokens).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })

    it('returns onboarding next step after verification when no password is configured', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        email: 'user@example.com',
        isPhoneVerified: true,
        passwordHash: null,
        onboardingStep: OnboardingStep.SELECT_PLAN,
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyEmail(user.email!, '123456')

      expect(result.nextStep).toBe(AuthNextStep.SELECT_BUSINESS)
      expect((result as any).tokens).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })
  })
})
