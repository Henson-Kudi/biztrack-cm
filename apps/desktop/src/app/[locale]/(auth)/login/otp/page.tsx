'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button, InputOTP, InputOTPGroup, InputOTPSlot } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import { acceptInvite, loginWithOtp, resendOtp } from '@/services/auth.api'
import { useAuthStore } from '@/stores/auth.store'
import { AuthNextStep } from '@biztrack/types'
import { routeForNextStep } from '@/lib/auth-routing'

export default function LoginOtpPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const pendingIdentifier = useAuthStore((s) => s.pending.identifier)
  const inviteToken = useAuthStore((s) => s.pending.inviteToken)
  const otpMessage = useAuthStore((s) => s.pending.otpMessage)
  const maskedPhone = useAuthStore((s) => s.pending.maskedPhone)
  const setTokens = useAuthStore((s) => s.setTokens)
  const setPending = useAuthStore((s) => s.setPending)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const submit = async () => {
    if (!pendingIdentifier) return goTo('/login')
    setError(null)
    setLoading(true)
    try {
      const response = await loginWithOtp(pendingIdentifier, code)
      if ('tokens' in response && response.tokens) {
        await setTokens(response.tokens)
      }
      if (inviteToken) {
        const inviteResponse = await acceptInvite(inviteToken)
        if ('tokens' in inviteResponse && inviteResponse.tokens) {
          await setTokens(inviteResponse.tokens)
        }
        setPending({ inviteToken: null })
        if (inviteResponse.nextStep === AuthNextStep.SETUP_BUSINESS) {
          return goTo(routeForNextStep(AuthNextStep.SETUP_BUSINESS))
        }
        if (inviteResponse.nextStep === AuthNextStep.SELECT_PLAN) {
          return goTo(routeForNextStep(AuthNextStep.SELECT_PLAN))
        }
        return goTo(routeForNextStep(AuthNextStep.DASHBOARD))
      }
      if (response.nextStep === AuthNextStep.SELECT_BUSINESS) {
        return goTo(routeForNextStep(AuthNextStep.SELECT_BUSINESS))
      }
      if (response.nextStep === AuthNextStep.DASHBOARD) {
        return goTo(routeForNextStep(AuthNextStep.DASHBOARD))
      }
      return goTo('/login')
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('otp.invalid'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await submit()
  }

  useEffect(() => {
    if (code.length === 6 && !loading) {
      submit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleResend = async () => {
    if (!pendingIdentifier) return
    setResending(true)
    try {
      const response = await resendOtp(pendingIdentifier, 'LOGIN')
      setPending({
        otpMessage: (response as any)?.message ?? null,
        maskedPhone: (response as any)?.context?.maskedPhone ?? null,
        otpExpiresIn: (response as any)?.context?.otpExpiresIn ?? null,
      })
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthCard title={t('login_otp.title')} subtitle={t('login_otp.subtitle')}>
      {(otpMessage || maskedPhone || pendingIdentifier) && (
        <p className="text-sm text-muted-foreground mb-4">
          {otpMessage ?? t('otp.sent_to', { target: maskedPhone ?? pendingIdentifier ?? '' })}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">{t('otp.code_label')}</label>
          <InputOTP value={code} onChange={setCode} maxLength={6} className="w-full">
            <InputOTPGroup className="w-full">
              {Array.from({ length: 6 }).map((_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('otp.loading') : t('otp.verify')}
        </Button>
      </form>
      <button
        className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        onClick={handleResend}
        disabled={resending}
      >
        {resending ? t('otp.resending') : t('otp.resend')}
      </button>
    </AuthCard>
  )
}




