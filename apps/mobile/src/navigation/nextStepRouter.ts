/**
 * Central nextStep router for auth screens.
 *
 * Every auth API response carries a `nextStep` field.
 * This helper maps each value to the correct navigation action,
 * storing tokens/user/business in the auth store when provided.
 */
import type { Router } from 'expo-router'
import type { AuthStepResponse } from '../services/auth.service'
import { useAuthStore } from '../store/useAuthStore'

export function handleNextStep(
  res: AuthStepResponse,
  router: Router,
  extra?: {
    phone?: string
    email?: string
    identifier?: string
    inviteToken?: string
  }
) {
  // Persist tokens and user data when the API returns them
  if (res.tokens && res.user) {
    useAuthStore.getState().setAuthState({
      accessToken: res.tokens.accessToken,
      refreshToken: res.tokens.refreshToken,
      user: res.user,
      business: res.business,
      authPermissions: res.authPermissions,
    })
  } else if (res.tokens) {
    useAuthStore.getState().setTokens(
      res.tokens.accessToken,
      res.tokens.refreshToken
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = (path: string, params?: Record<string, string>) =>
    params ? router.push({ pathname: path as never, params }) : router.replace(path as never)

  switch (res.nextStep) {
    case 'verify_phone':
      nav('/(auth)/verify-phone', {
        phone: extra?.phone ?? '',
        type: 'login',
        maskedPhone: res.context?.maskedPhone ?? '',
      })
      break

    case 'verify_email':
      nav('/(auth)/verify-email', {
        email: extra?.email ?? '',
        type: 'login',
        maskedEmail: res.context?.maskedEmail ?? '',
      })
      break

    case 'password_required':
      nav('/(auth)/password', { identifier: extra?.identifier ?? extra?.phone ?? '' })
      break

    case 'confirm_login':
      nav('/(auth)/otp-login', { identifier: extra?.identifier ?? extra?.phone ?? '' })
      break

    case 'select_business':
      router.replace('/(auth)/select-business' as never)
      break

    case 'setup_business':
      router.replace('/(auth)/setup-business' as never)
      break

    case 'select_plan':
      router.replace('/(auth)/select-plan' as never)
      break

    case 'add_first_product':
      router.replace('/(auth)/first-product' as never)
      break

    case 'dashboard':
      router.replace('/(tabs)' as never)
      break

    case 'login':
      router.replace('/(auth)' as never)
      break

    case 'register':
      nav('/(auth)/register', {
        phone: extra?.phone ?? '',
        ...(extra?.inviteToken ? { inviteToken: extra.inviteToken } : {}),
      })
      break

    default:
      router.replace('/(auth)' as never)
      break
  }
}
