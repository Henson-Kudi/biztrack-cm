import { AuthNextStep } from '@biztrack/types'

const NEXT_STEP_ALIASES: Record<string, AuthNextStep> = {
  verify_phone: AuthNextStep.VERIFY_PHONE,
  verify_email: AuthNextStep.VERIFY_EMAIL,
  password_required: AuthNextStep.PASSWORD_REQUIRED,
  password_login: AuthNextStep.PASSWORD_REQUIRED,
  confirm_login: AuthNextStep.CONFIRM_LOGIN,
  otp_login: AuthNextStep.CONFIRM_LOGIN,
  login_complete: AuthNextStep.LOGIN_COMPLETE,
  select_business: AuthNextStep.SELECT_BUSINESS,
  select_plan: AuthNextStep.SELECT_PLAN,
  setup_business: AuthNextStep.SETUP_BUSINESS,
  add_first_product: AuthNextStep.ADD_FIRST_PRODUCT,
  dashboard: AuthNextStep.DASHBOARD,
  register: AuthNextStep.REGISTER,
  login: AuthNextStep.LOGIN,
  request_new_otp: AuthNextStep.REQUEST_NEW_OTP,
}

export function normalizeAuthNextStep(step: string | AuthNextStep): AuthNextStep {
  const key = String(step).trim().toLowerCase().replace(/[-\s]/g, '_')
  return NEXT_STEP_ALIASES[key] ?? AuthNextStep.LOGIN
}

export function routeForNextStep(nextStep: AuthNextStep | string) {
  const normalized = normalizeAuthNextStep(nextStep)
  switch (normalized) {
    case AuthNextStep.VERIFY_PHONE:
      return '/verify-phone'
    case AuthNextStep.VERIFY_EMAIL:
      return '/verify-email'
    case AuthNextStep.PASSWORD_REQUIRED:
      return '/login/password'
    case AuthNextStep.CONFIRM_LOGIN:
      return '/login/otp'
    case AuthNextStep.LOGIN_COMPLETE:
      return '/'
    case AuthNextStep.SELECT_BUSINESS:
      return '/select-business'
    case AuthNextStep.SETUP_BUSINESS:
      return '/setup-business'
    case AuthNextStep.SELECT_PLAN:
      return '/select-plan'
    case AuthNextStep.ADD_FIRST_PRODUCT:
      return '/add-first-product'
    case AuthNextStep.DASHBOARD:
      return '/'
    case AuthNextStep.LOGIN:
      return '/login'
    case AuthNextStep.REGISTER:
      return '/register'
    case AuthNextStep.REQUEST_NEW_OTP:
      return '/login'
    default:
      return '/login'
  }
}
