'use client'

import { api } from './api'
import type {
  AddRolePermissionRequest,
  AuthNextStepResponse,
  AuthTokens,
  BulkUpdateMemberRoleRequest,
  BulkUpdateMemberRoleResponse,
  Business,
  BusinessMembershipSummary,
  User,
  CancelInviteResponse,
  CancelPlanResponse,
  CreateRoleRequest,
  CurrentSubscriptionResponse,
  InvitePreviewResponse,
  ListPendingInvitesResponse,
  ListPermissionsResponse,
  ListPlansResponse,
  ListRolesResponse,
  ListTeamMembersResponse,
  LoginOtpRequest,
  LoginRequest,
  LogoutRequest,
  LogoutResponse,
  PlanStateResponse,
  QuotaUsageResponse,
  RefreshTokenRequest,
  RegisterRequest,
  RemoveTeamMemberResponse,
  RequestLoginRequest,
  ResendInviteResponse,
  ResendOtpRequest,
  RoleWithPermissions,
  SelectBusinessRequest,
  SelectPlanRequest,
  SelectPlanResponse,
  SendInviteRequest,
  SendInviteResponse,
  SetRolePermissionsRequest,
  TokensResponse,
  UpdateBusinessRequest,
  UpdateMemberRoleRequest,
  UpdateMemberRoleResponse,
  UpdateRoleRequest,
  UpgradePlanRequest,
  UpgradePlanResponse,
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

export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<ApiEnvelope<User>>('/users/me')
  return unwrapApiResponse<User>(data)
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

export async function getPlanState(): Promise<PlanStateResponse> {
  const { data } = await api.get<ApiEnvelope<PlanStateResponse>>('/plans/state')
  return unwrapApiResponse<PlanStateResponse>(data)
}

export async function getQuotaUsage(): Promise<QuotaUsageResponse> {
  const { data } = await api.get<ApiEnvelope<QuotaUsageResponse>>('/plans/quota-usage')
  return unwrapApiResponse<QuotaUsageResponse>(data)
}

export async function mySubscription(): Promise<CurrentSubscriptionResponse> {
  const { data } = await api.get<ApiEnvelope<CurrentSubscriptionResponse>>('/plans/my-subscription')
  return unwrapApiResponse<CurrentSubscriptionResponse>(data)
}

export async function upgradePlan(payload: UpgradePlanRequest): Promise<UpgradePlanResponse> {
  const { data } = await api.post<ApiEnvelope<UpgradePlanResponse>>('/plans/upgrade', payload)
  return unwrapApiResponse<UpgradePlanResponse>(data)
}

export async function cancelPlan(): Promise<CancelPlanResponse> {
  const { data } = await api.post<ApiEnvelope<CancelPlanResponse>>('/plans/cancel', {})
  return unwrapApiResponse<CancelPlanResponse>(data)
}

export async function sendInvite(payload: SendInviteRequest): Promise<SendInviteResponse> {
  const { data } = await api.post<ApiEnvelope<SendInviteResponse>>('/invites', payload)
  return unwrapApiResponse<SendInviteResponse>(data)
}

export async function listTeamMembers(): Promise<ListTeamMembersResponse> {
  const { data } = await api.get<ApiEnvelope<ListTeamMembersResponse>>('/businesses/members')
  return unwrapApiResponse<ListTeamMembersResponse>(data)
}

export async function updateMemberRole(
  userId: string,
  payload: UpdateMemberRoleRequest,
): Promise<UpdateMemberRoleResponse> {
  const { data } = await api.patch<ApiEnvelope<UpdateMemberRoleResponse>>(
    `/businesses/members/${userId}/role`,
    payload,
  )
  return unwrapApiResponse<UpdateMemberRoleResponse>(data)
}

export async function bulkUpdateMemberRole(
  payload: BulkUpdateMemberRoleRequest,
): Promise<BulkUpdateMemberRoleResponse> {
  const { data } = await api.patch<ApiEnvelope<BulkUpdateMemberRoleResponse>>(
    '/businesses/members/bulk-role',
    payload,
  )
  return unwrapApiResponse<BulkUpdateMemberRoleResponse>(data)
}

export async function removeTeamMember(userId: string): Promise<RemoveTeamMemberResponse> {
  const { data } = await api.delete<ApiEnvelope<RemoveTeamMemberResponse>>(
    `/businesses/members/${userId}`,
  )
  return unwrapApiResponse<RemoveTeamMemberResponse>(data)
}

export async function listInvites(): Promise<ListPendingInvitesResponse> {
  const { data } = await api.get<ApiEnvelope<ListPendingInvitesResponse>>('/invites')
  return unwrapApiResponse<ListPendingInvitesResponse>(data)
}

export async function resendInvite(inviteId: string): Promise<ResendInviteResponse> {
  const { data } = await api.post<ApiEnvelope<ResendInviteResponse>>(
    `/invites/${inviteId}/resend`,
    {},
  )
  return unwrapApiResponse<ResendInviteResponse>(data)
}

export async function cancelInvite(inviteId: string): Promise<CancelInviteResponse> {
  const { data } = await api.delete<ApiEnvelope<CancelInviteResponse>>(`/invites/${inviteId}`)
  return unwrapApiResponse<CancelInviteResponse>(data)
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

// ── Roles & Permissions ──────────────────────────────────────────────────────

export async function listRoles(params?: {
  page?: number
  limit?: number
  search?: string
}): Promise<ListRolesResponse> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.search) query.set('search', params.search)
  const qs = query.toString()
  const { data } = await api.get<ApiEnvelope<ListRolesResponse>>(`/roles${qs ? `?${qs}` : ''}`)
  return unwrapApiResponse<ListRolesResponse>(data)
}

export async function getRole(id: string): Promise<RoleWithPermissions> {
  const { data } = await api.get<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}`)
  return unwrapApiResponse<RoleWithPermissions>(data)
}

export async function createRole(payload: CreateRoleRequest): Promise<RoleWithPermissions> {
  const { data } = await api.post<ApiEnvelope<RoleWithPermissions>>('/roles', payload)
  return unwrapApiResponse<RoleWithPermissions>(data)
}

export async function updateRole(id: string, payload: UpdateRoleRequest): Promise<RoleWithPermissions> {
  const { data } = await api.patch<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}`, payload)
  return unwrapApiResponse<RoleWithPermissions>(data)
}

export async function deleteRole(id: string): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<ApiEnvelope<{ deleted: boolean }>>(`/roles/${id}`)
  return unwrapApiResponse<{ deleted: boolean }>(data)
}

export async function setRolePermissions(id: string, payload: SetRolePermissionsRequest): Promise<RoleWithPermissions> {
  const { data } = await api.put<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}/permissions`, payload)
  return unwrapApiResponse<RoleWithPermissions>(data)
}

export async function addRolePermission(id: string, payload: AddRolePermissionRequest): Promise<RoleWithPermissions> {
  const { data } = await api.post<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}/permissions`, payload)
  return unwrapApiResponse<RoleWithPermissions>(data)
}

export async function removeRolePermission(id: string, permission: string): Promise<RoleWithPermissions> {
  const { data } = await api.delete<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}/permissions/${permission}`)
  return unwrapApiResponse<RoleWithPermissions>(data)
}

export async function listPermissions(): Promise<ListPermissionsResponse> {
  const { data } = await api.get<ApiEnvelope<ListPermissionsResponse>>('/roles/permissions')
  return unwrapApiResponse<ListPermissionsResponse>(data)
}
