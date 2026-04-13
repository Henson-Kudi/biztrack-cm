'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button, InputOTP, InputOTPGroup, InputOTPSlot } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import { verifyPhone, resendOtp } from '@/services/auth.api'
import { useAuthStore } from '@/stores/auth.store'
import { AuthNextStep } from '@biztrack/types'
import { routeForNextStep } from '@/lib/auth-routing'

export default function VerifyPhonePage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const phone = useAuthStore((s) => s.pending.phone)
  const inviteToken = useAuthStore((s) => s.pending.inviteToken)
  const otpMessage = useAuthStore((s) => s.pending.otpMessage)
  const maskedPhone = useAuthStore((s) => s.pending.maskedPhone)
  const setTokens = useAuthStore((s) => s.setTokens)
  const setPending = useAuthStore((s) => s.setPending)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const submit = async () => {
    if (!phone) return goTo('/register')
    setError(null)
    setLoading(true)
    try {
      const response = await verifyPhone(phone, code, inviteToken)
      if ('tokens' in response && response.tokens) {
        await setTokens(response.tokens)
      }
      if (response.nextStep === AuthNextStep.VERIFY_EMAIL) {
        setPending({
          otpMessage: (response as any)?.message ?? null,
          maskedEmail: (response as any)?.context?.maskedEmail ?? null,
          otpExpiresIn: (response as any)?.context?.otpExpiresIn ?? null,
        })
        return goTo(routeForNextStep(AuthNextStep.VERIFY_EMAIL))
      }
      if (response.nextStep === AuthNextStep.SELECT_BUSINESS) {
        return goTo(routeForNextStep(AuthNextStep.SELECT_BUSINESS))
      }
      if (response.nextStep === AuthNextStep.SETUP_BUSINESS) {
        return goTo(routeForNextStep(AuthNextStep.SETUP_BUSINESS))
      }
      if (response.nextStep === AuthNextStep.SELECT_PLAN) {
        return goTo(routeForNextStep(AuthNextStep.SELECT_PLAN))
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
    if (!phone) return
    setResending(true)
    try {
      const response = await resendOtp(phone, 'VERIFY_PHONE')
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
    <AuthCard title={t('verify_phone.title')} subtitle={t('verify_phone.subtitle')}>
      {(otpMessage || maskedPhone || phone) && (
        <p className="text-sm text-muted-foreground mb-4">
          {otpMessage ?? t('otp.sent_to', { target: maskedPhone ?? phone ?? '' })}
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




