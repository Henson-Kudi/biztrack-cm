import apiClient from './apiClient'
import type { AuthBusiness, AuthPermissions, AuthUser, Locale } from '../store/useAuthStore'

// ─── Response shape from the API ─────────────────────────────────────────────

export interface AuthStepResponse {
  nextStep: string
  message?: string
  context?: {
    maskedPhone?: string
    maskedEmail?: string
    otpExpiresIn?: number
    attemptsLeft?: number
    lockUntil?: string
    joinedBusiness?: string
  }
  tokens?: {
    accessToken: string
    refreshToken: string
  }
  authPermissions?: AuthPermissions
  user?: AuthUser
  business?: AuthBusiness
}

// ─── Registration ─────────────────────────────────────────────────────────────

export interface RegisterDto {
  name: string
  phone: string
  password: string
  email?: string
  locale?: Locale
  preferredOtpChannel?: 'SMS' | 'WHATSAPP' | 'EMAIL'
  inviteToken?: string
}

export const register = (dto: RegisterDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/register', dto)

// ─── Phone Verification ───────────────────────────────────────────────────────

export interface VerifyPhoneDto {
  phone: string
  code: string
  inviteToken?: string
}

export const verifyPhone = (dto: VerifyPhoneDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/verify-phone', dto)

// ─── Email Verification ───────────────────────────────────────────────────────

export interface VerifyEmailDto {
  email: string
  code: string
  inviteToken?: string
}

export const verifyEmail = (dto: VerifyEmailDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/verify-email', dto)

// ─── Request Login (determines login method) ──────────────────────────────────

export interface RequestLoginDto {
  identifier: string   // phone or email
  preferredOtpChannel?: 'SMS' | 'WHATSAPP' | 'EMAIL'
}

export const requestLogin = (dto: RequestLoginDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/request-login', dto)

// ─── Password Login ───────────────────────────────────────────────────────────

export interface LoginDto {
  identifier: string
  password: string
}

export const login = (dto: LoginDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/login', dto)

// ─── OTP Login (passwordless) ─────────────────────────────────────────────────

export interface LoginOtpDto {
  identifier: string
  code: string
}

export const loginOtp = (dto: LoginOtpDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/login-otp', dto)

// ─── Resend OTP ───────────────────────────────────────────────────────────────

export interface ResendOtpDto {
  identifier: string
  type: 'VERIFY_PHONE' | 'VERIFY_EMAIL' | 'LOGIN'
  channel?: 'SMS' | 'WHATSAPP' | 'EMAIL'
}

export const resendOtp = (dto: ResendOtpDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/resend-otp', dto)

// ─── Select Business ──────────────────────────────────────────────────────────

export interface SelectBusinessDto {
  businessId: string
}

export const selectBusiness = (dto: SelectBusinessDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/auth/select-business', dto)

// ─── Get user's businesses ────────────────────────────────────────────────────

export interface BusinessListItem {
  id: string
  name: string
  role: string
  status: string
  plan: string
}

export const getMyBusinesses = (): Promise<{ businesses: BusinessListItem[] }> =>
  apiClient.get<{ businesses: BusinessListItem[] }>('/businesses/mine')

// ─── Setup Business (onboarding step 1) ──────────────────────────────────────

export type BusinessType =
  | 'EPICERIE'
  | 'BOUTIQUE'
  | 'RESTAURANT'
  | 'PHARMACIE'
  | 'SALON'
  | 'ELECTRONIQUE'
  | 'AUTRE'

export interface SetupBusinessDto {
  name: string
  type: BusinessType
  city: string
}

export const setupBusiness = (dto: SetupBusinessDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/businesses/setup', dto)

// ─── Get Plans ────────────────────────────────────────────────────────────────

export interface PlanOption {
  name: string
  displayName: string
  priceXAF: number
  trialDays: number
  resources: string[]
  inheritsFrom: string | null
  additionalResources: string[]
}

export const getPlans = (): Promise<{ plans: PlanOption[]; currentPlan: string | null }> =>
  apiClient.get<{ plans: PlanOption[]; currentPlan: string | null }>('/plans')

// ─── Select Plan (onboarding step 2) ─────────────────────────────────────────

export type SubscriptionPlan = 'FREE' | 'SOLO' | 'BUSINESS' | 'PRO'

export interface SelectPlanDto {
  plan: SubscriptionPlan
}

export const selectPlan = (dto: SelectPlanDto): Promise<AuthStepResponse> =>
  apiClient.post<AuthStepResponse>('/plans/select', dto)

// ─── Token Refresh ────────────────────────────────────────────────────────────

export const refreshTokens = (refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
}> =>
  apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken })

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = (refreshToken: string): Promise<void> =>
  apiClient.post<void>('/auth/logout', { refreshToken })

// ─── Invite Preview ───────────────────────────────────────────────────────────

export interface InviteInfo {
  businessName: string
  role: string
  invitedByName: string
  expiresAt: string
  sentTo: string
}

export const getInvite = (token: string): Promise<InviteInfo> =>
  apiClient.get<InviteInfo>(`/invites/${token}`)
