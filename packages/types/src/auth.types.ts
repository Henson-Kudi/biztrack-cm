import { SubscriptionPlan, BusinessMemberRole } from './business.types'
import type { AuthPermissions } from './permissions.types'
import type { IsoDateString } from './http.types'

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  ADMIN = 'ADMIN',
}

export enum VerificationChannel {
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
}

export enum AuthNextStep {
  VERIFY_PHONE = 'verify_phone',
  VERIFY_EMAIL = 'verify_email',
  PASSWORD_REQUIRED = 'password_required',
  CONFIRM_LOGIN = 'confirm_login',
  LOGIN_COMPLETE = 'login_complete',
  SELECT_BUSINESS = 'select_business',
  SELECT_PLAN = 'select_plan',
  SETUP_BUSINESS = 'setup_business',
  ADD_FIRST_PRODUCT = 'add_first_product',
  DASHBOARD = 'dashboard',
  REGISTER = 'register',
  LOGIN = 'login',
  REQUEST_NEW_OTP = 'request_new_otp',
}

export enum PrefferedPhoneChannel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
}

export interface AuthVerification {
  channel: VerificationChannel
  delivery?: PrefferedPhoneChannel
  expiresAt: IsoDateString
  code?: string
}

export enum OtpType {
  VERIFY_PHONE = 'VERIFY_PHONE',
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  LOGIN = 'LOGIN',
}

export interface RegisterRequest {
  name: string
  phone: string
  email?: string
  password: string
  language?: string
  locale?: string
  preferredPhoneChannel?: PrefferedPhoneChannel
  inviteToken?: string
}

export interface LoginRequest {
  identifier: string
  password: string
}

export interface RequestLoginRequest {
  identifier: string
  preferredOtpChannel?: PrefferedPhoneChannel
}

export interface RequestLoginOtpRequest {
  phone: string
}

export interface LoginOtpRequest {
  identifier: string
  code: string
}

export interface VerifyPhoneRequest {
  phone: string
  code: string
  inviteToken?: string
}

export interface VerifyEmailRequest {
  email: string
  code: string
  inviteToken?: string
}

export interface RefreshTokenRequest {
  refreshToken?: string
}

export interface SelectBusinessRequest {
  businessId: string
}

export interface ResendOtpRequest {
  identifier: string
  type: OtpType
  channel?: PrefferedPhoneChannel
}

export interface LogoutRequest {
  refreshToken?: string
}

export interface LogoutResponse {
  status: 'logged_out'
}

export interface SendInviteRequest {
  roleId: string
  phone?: string
  email?: string
}

export interface AuthNextStepVerifyPhoneResponse {
  nextStep: AuthNextStep.VERIFY_PHONE
  context: AuthContext
  verification: AuthVerification
}

export interface AuthNextStepVerifyEmailResponse {
  nextStep: AuthNextStep.VERIFY_EMAIL
  context: AuthContext
  verification: AuthVerification
}

export interface AuthNextStepPasswordRequiredResponse {
  nextStep: AuthNextStep.PASSWORD_REQUIRED
}

export interface AuthNextStepLoginCompleteResponse {
  nextStep: AuthNextStep.LOGIN_COMPLETE
  displayName: string
  tokens: AuthTokens
}

export interface AuthNextStepSelectBusinessResponse {
  nextStep: AuthNextStep.SELECT_BUSINESS
  tokens: AuthTokens
}

export interface AuthNextStepOnboardingResponse {
  nextStep:
    | AuthNextStep.SELECT_PLAN
    | AuthNextStep.SETUP_BUSINESS
    | AuthNextStep.ADD_FIRST_PRODUCT
    | AuthNextStep.DASHBOARD
  tokens: AuthTokens
  authPermissions?: AuthPermissions
}

export interface AuthNextStepRequestNewOtpResponse {
  nextStep: AuthNextStep.REQUEST_NEW_OTP
  context?: AuthContext
}

export interface AuthNextStepConfirmLoginResponse {
  nextStep: AuthNextStep.CONFIRM_LOGIN
  context: AuthContext
  verification: AuthVerification
}

export type AuthNextStepResponse =
  | AuthNextStepVerifyPhoneResponse
  | AuthNextStepVerifyEmailResponse
  | AuthNextStepPasswordRequiredResponse
  | AuthNextStepConfirmLoginResponse
  | AuthNextStepLoginCompleteResponse
  | AuthNextStepSelectBusinessResponse
  | AuthNextStepOnboardingResponse
  | AuthNextStepRequestNewOtpResponse

export interface User {
  id: string
  email?: string | null
  phone?: string | null
  name: string
  avatarUrl?: string | null
  role: UserRole
  language: string
  isEmailVerified: boolean
  isPhoneVerified: boolean
  isActive: boolean
  preferredPhoneChannel?: PrefferedPhoneChannel | null
  businessId?: string | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthContext {
  maskedPhone?: string
  maskedEmail?: string
  otpChannel?: VerificationChannel
  otpExpiresIn?: number
  attemptsLeft?: number
  lockUntil?: number
  requiresPlan?: SubscriptionPlan
}

export interface TokensResponse {
  tokens: AuthTokens
}

export interface InvitePreviewResponse {
  businessName: string
  role: BusinessMemberRole | null
  invitedByName: string | null
  expiresAt: IsoDateString
  sentTo: string | null
  /** Unmasked — used to pre-fill the register/login form for the invitee */
  email: string | null
  phone: string | null
}

export interface SendInvitePendingMemberResponse {
  status: 'pending_member'
  businessId: string
  userId: string
  inviteUrl: string | null
}

export interface SendInvitePendingInviteResponse {
  status: 'pending_invite'
  token: string
  expiresAt: IsoDateString
  inviteUrl: string
}

export type SendInviteResponse = SendInvitePendingMemberResponse | SendInvitePendingInviteResponse

export interface RejectInviteResponse {
  status: 'rejected'
}

export type AuthMeResponse = JwtPayload

export interface JwtPayload {
  sub: string
  email?: string | null
  phone?: string | null
  role?: BusinessMemberRole | null
  roleId?: string | null
  isOwner?: boolean
  businessId?: string | null
  deviceId?: string | null
  tokenId?: string | null
  type?: 'phase1' | 'phase2' | 'sync'
}
