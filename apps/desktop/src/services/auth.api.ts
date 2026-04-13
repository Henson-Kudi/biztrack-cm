'use client'

import { api } from './api'
import type {
  AuthNextStepResponse,
  AuthTokens,
  PrefferedPhoneChannel,
  SubscriptionPlan,
} from '@biztrack/types'

export type RegisterPayload = {
  name: string
  phone: string
  password: string
  email?: string
  preferredPhoneChannel?: PrefferedPhoneChannel
  inviteToken?: string
  locale?: string
  language?: string
}

type ApiEnvelope<T> = {
  success: boolean
  data?: T
  message?: string
  requestId?: string
  timestamp?: string
}

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'success' in (payload as object)) {
    return (payload as ApiEnvelope<T>).data as T
  }
  return payload as T
}

export async function register(payload: RegisterPayload): Promise<AuthNextStepResponse> {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/register',
    payload,
    { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<AuthNextStepResponse>(data)
}

export async function requestLogin(identifier: string, preferredOtpChannel?: PrefferedPhoneChannel) {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/request-login',
    { identifier, preferredOtpChannel },
    { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<AuthNextStepResponse>(data)
}

export async function login(identifier: string, password: string) {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/login',
    { identifier, password },
    { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<AuthNextStepResponse>(data)
}

export async function loginWithOtp(identifier: string, code: string) {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/login-otp',
    { identifier, code },
    { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<AuthNextStepResponse>(data)
}

export async function verifyPhone(phone: string, code: string, inviteToken?: string | null) {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/verify-phone',
    { phone, code, inviteToken },
    { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<AuthNextStepResponse>(data)
}

export async function verifyEmail(email: string, code: string, inviteToken?: string | null) {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/verify-email',
    { email, code, inviteToken },
    { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<AuthNextStepResponse>(data)
}

export async function resendOtp(identifier: string, type: 'VERIFY_PHONE' | 'VERIFY_EMAIL' | 'LOGIN') {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(
    '/auth/resend-otp',
    { identifier, type },
    { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<AuthNextStepResponse>(data)
}

export async function selectBusiness(businessId: string) {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>('/auth/select-business', { businessId })
  return unwrap<AuthNextStepResponse>(data)
}

export async function getInvitePreview(token: string) {
  const { data } = await api.get<ApiEnvelope<any>>(`/invites/${token}`, {
    headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' },
  })
  return unwrap<any>(data)
}

export async function acceptInvite(token: string) {
  const { data } = await api.post<ApiEnvelope<AuthNextStepResponse>>(`/invites/${token}/accept`)
  return unwrap<AuthNextStepResponse>(data)
}

export async function getBusinesses() {
  const { data } = await api.get<ApiEnvelope<Array<{
    businessId: string
    role: string
    status: string
    business: {
      id: string
      name: string
      slug: string
      city?: string | null
      type?: string | null
      plan?: SubscriptionPlan | null
      businessStatus?: string | null
    } | null
  }>>>('/businesses/mine')
  return unwrap<
    Array<{
      businessId: string
      role: string
      status: string
      business: {
        id: string
        name: string
        slug: string
        city?: string | null
        type?: string | null
        plan?: SubscriptionPlan | null
        businessStatus?: string | null
      } | null
    }>
  >(data)
}

export async function setupBusiness(payload: {
  name: string
  city?: string
  address?: string
}) {
  const { data } = await api.post<ApiEnvelope<any>>('/businesses/setup', payload)
  return unwrap<any>(data)
}

export async function listPlans() {
  const { data } = await api.get<ApiEnvelope<any>>('/plans')
  return unwrap<{
    plans: Array<{
      name: SubscriptionPlan
      displayName: string
      priceXAF: number
      trialDays: number
      resources: string[]
    }>
    currentPlan: SubscriptionPlan | null
  }>(data)
}

export async function selectPlan(plan: SubscriptionPlan) {
  const { data } = await api.post<ApiEnvelope<{ nextStep?: string; authPermissions?: unknown }>>('/plans/select', { plan })
  return unwrap<{ nextStep?: string; authPermissions?: unknown }>(data)
}

export async function refreshTokens(refreshToken?: string): Promise<{ tokens: AuthTokens }> {
  const payload = refreshToken ? { refreshToken } : {}
  const { data } = await api.post<ApiEnvelope<{ tokens: AuthTokens }>>(
    '/auth/refresh',
    payload,
    { headers: { 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<{ tokens: AuthTokens }>(data)
}

export async function logout(refreshToken?: string) {
  const payload = refreshToken ? { refreshToken } : {}
  const { data } = await api.post<ApiEnvelope<any>>(
    '/auth/logout',
    payload,
    { headers: { 'x-skip-auth-refresh': '1' } },
  )
  return unwrap<any>(data)
}
