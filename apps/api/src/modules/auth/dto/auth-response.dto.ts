import type {
  AuthContext,
  AuthMeResponse,
  AuthNextStepResponse,
  AuthVerification,
  InvitePreviewResponse,
  JwtPayload,
  LogoutResponse,
  RejectInviteResponse,
  SendInviteResponse,
  TokensResponse,
} from '@biztrack/types'
import { BusinessMemberRole } from '@biztrack/types'
import { toIsoString } from '@/common/http/serialization'

export class AuthVerificationDto implements AuthVerification {
  channel!: AuthVerification['channel']
  delivery?: AuthVerification['delivery']
  expiresAt!: string
  code?: string

  static fromModel(
    model?: {
      channel: AuthVerification['channel']
      delivery?: AuthVerification['delivery']
      expiresAt: Date | string
      code?: string
    } | null,
  ): AuthVerificationDto | undefined {
    if (!model) return undefined

    const dto = new AuthVerificationDto()
    dto.channel = model.channel
    dto.delivery = model.delivery
    dto.expiresAt = toIsoString(model.expiresAt) ?? ''
    dto.code = model.code
    return dto
  }
}

export class AuthContextDto implements AuthContext {
  maskedPhone?: string
  maskedEmail?: string
  otpChannel?: AuthContext['otpChannel']
  otpExpiresIn?: number
  attemptsLeft?: number
  lockUntil?: number
  requiresPlan?: AuthContext['requiresPlan']

  static fromModel(model?: AuthContext | null): AuthContextDto | undefined {
    if (!model) return undefined
    return Object.assign(new AuthContextDto(), model)
  }
}

export class AuthNextStepResponseDto {
  static fromResult(result: any): AuthNextStepResponse {
    return {
      ...result,
      context: AuthContextDto.fromModel(result.context),
      verification: AuthVerificationDto.fromModel(result.verification),
      subscription: result.subscription
        ? {
            ...result.subscription,
            trialEndsAt: toIsoString(result.subscription.trialEndsAt) ?? null,
          }
        : undefined,
    } as AuthNextStepResponse
  }
}

export class TokensResponseDto implements TokensResponse {
  tokens!: TokensResponse['tokens']

  static fromModel(model: TokensResponse): TokensResponseDto {
    return Object.assign(new TokensResponseDto(), model)
  }
}

export class InvitePreviewDto implements InvitePreviewResponse {
  businessName!: string
  role!: BusinessMemberRole | null
  invitedByName!: string | null
  expiresAt!: string
  sentTo!: string | null
  email!: string | null
  phone!: string | null

  static fromModel(
    model: Omit<InvitePreviewResponse, 'expiresAt'> & { expiresAt: Date | string },
  ): InvitePreviewDto {
    const dto = new InvitePreviewDto()
    dto.businessName = model.businessName
    dto.role = model.role
    dto.invitedByName = model.invitedByName
    dto.expiresAt = toIsoString(model.expiresAt) ?? ''
    dto.sentTo = model.sentTo
    dto.email = model.email
    dto.phone = model.phone
    return dto
  }
}

export class SendInviteResponseDto {
  static fromModel(model: {
    status: string
    businessId?: string
    userId?: string
    token?: string
    expiresAt?: Date | string
  }): SendInviteResponse {
    return {
      ...model,
      expiresAt: 'expiresAt' in model ? (toIsoString(model.expiresAt) ?? '') : undefined,
    } as SendInviteResponse
  }
}

export class RejectInviteResponseDto implements RejectInviteResponse {
  status!: 'rejected'

  static fromModel(model: { status: string }): RejectInviteResponseDto {
    return Object.assign(new RejectInviteResponseDto(), model)
  }
}

export class LogoutResponseDto implements LogoutResponse {
  status!: 'logged_out'

  static fromModel(model?: Partial<LogoutResponse>): LogoutResponseDto {
    return Object.assign(new LogoutResponseDto(), {
      status: 'logged_out',
      ...(model ?? {}),
    })
  }
}

export class CurrentUserDto implements AuthMeResponse {
  sub!: string
  email?: string | null
  phone?: string | null
  role?: JwtPayload['role']
  businessId?: string | null
  type?: JwtPayload['type']

  static fromPayload(payload: JwtPayload): CurrentUserDto {
    return Object.assign(new CurrentUserDto(), payload)
  }
}
