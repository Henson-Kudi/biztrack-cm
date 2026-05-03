'use client'

import { api } from './api'
import type {
  AuthNextStepResponse,
  AuthTokens,
  Business,
  BusinessMembershipSummary,
  InvitePreviewResponse,
  ListPlansResponse,
  LoginOtpRequest,
  LoginRequest,
  LogoutRequest,
  LogoutResponse,
  RefreshTokenRequest,
  RegisterRequest,
  RequestLoginRequest,
  ResendOtpRequest,
  SelectBusinessRequest,
  SelectPlanRequest,
  SelectPlanResponse,
  TokensResponse,
  UpdateBusinessRequest,
  VerifyEmailRequest,
  VerifyPhoneRequest,
} from '@biztrack/types'
import { ApiEnvelope, unwrapApiResponse } from './api-response'

const publicAuthHeaders = {
  'x-skip-auth': '1',
  'x-skip-auth-refresh': '1',
} as const

export async function register(payload: RegisterRequest): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>('/auth/register', payload, {
    headers: publicAuthHeaders,
  })
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function requestLogin(payload: RequestLoginRequest): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/request-login',
    payload,
    { headers: publicAuthHeaders },
  )
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function login(payload: LoginRequest): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>('/auth/login', payload, {
    headers: publicAuthHeaders,
  })
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function loginWithOtp(payload: LoginOtpRequest): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>('/auth/login-otp', payload, {
    headers: publicAuthHeaders,
  })
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function verifyPhone(payload: VerifyPhoneRequest): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/verify-phone',
    payload,
    { headers: publicAuthHeaders },
  )
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function verifyEmail(payload: VerifyEmailRequest): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/verify-email',
    payload,
    { headers: publicAuthHeaders },
  )
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function resendOtp(payload: ResendOtpRequest): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>('/auth/resend-otp', payload, {
    headers: publicAuthHeaders,
  })
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function selectBusiness(
  payload: SelectBusinessRequest,
): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/select-business',
    payload,
  )
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function getInvitePreview(token: string): Promise<InvitePreviewResponse> {
  const { data } = await api.get<ApiEnvelope<InvitePreviewResponse>>(`/invites/${token}`, {
    headers: publicAuthHeaders,
  })
  return unwrapApiResponse<InvitePreviewResponse>(data)
}

export async function acceptInvite(token: string): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(`/invites/${token}/accept`)
  return unwrapApiResponse<AuthNextStepResponse>(data)
}

export async function getBusinesses(): Promise<BusinessMembershipSummary[]> {
  const { data } = await api.get<ApiEnvelope<BusinessMembershipSummary[]>>('/businesses/mine')
  return unwrapApiResponse<BusinessMembershipSummary[]>(data)
}

export async function setupBusiness(payload: UpdateBusinessRequest): Promise<Business> {
  const { data } = await api.post<ApiEnvelope<Business>>('/businesses/setup', payload)
  return unwrapApiResponse<Business>(data)
}

export async function listPlans(): Promise<ListPlansResponse> {
  const { data } = await api.get<ApiEnvelope<ListPlansResponse>>('/plans')
  return unwrapApiResponse<ListPlansResponse>(data)
}

export async function selectPlan(payload: SelectPlanRequest): Promise<SelectPlanResponse> {
  const { data } = await api.post<ApiEnvelope<SelectPlanResponse>>('/plans/select', payload)
  return unwrapApiResponse<SelectPlanResponse>(data)
}

export async function refreshTokens(payload?: RefreshTokenRequest): Promise<TokensResponse> {
  const { data } = await api.post<ApiEnvelope<TokensResponse>>('/auth/refresh', payload ?? {}, {
    headers: { 'x-skip-auth-refresh': '1' },
  })
  return unwrapApiResponse<TokensResponse>(data)
}

export async function logout(payload?: LogoutRequest): Promise<LogoutResponse> {
  const { data } = await api.post<ApiEnvelope<LogoutResponse>>('/auth/logout', payload ?? {}, {
    headers: { 'x-skip-auth-refresh': '1' },
  })
  return unwrapApiResponse<LogoutResponse>(data)
}

export function getAuthTokens(response: AuthNextStepResponse): AuthTokens | undefined {
  return 'tokens' in response ? response.tokens : undefined
}

export function getAuthMaskedPhone(response: AuthNextStepResponse): string | null {
  return 'context' in response ? (response.context?.maskedPhone ?? null) : null
}

export function getAuthMaskedEmail(response: AuthNextStepResponse): string | null {
  return 'context' in response ? (response.context?.maskedEmail ?? null) : null
}

export function getAuthOtpExpiresIn(response: AuthNextStepResponse): number | null {
  return 'context' in response ? (response.context?.otpExpiresIn ?? null) : null
}
