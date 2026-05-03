'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { OtpType } from '@biztrack/types'
import { Button, InputOTP, InputOTPGroup, InputOTPSlot } from '@biztrack/ui'
import { AuthCard } from '@/components/auth/AuthCard'
import {
  acceptInvite,
  getAuthMaskedPhone,
  getAuthOtpExpiresIn,
  getAuthTokens,
  loginWithOtp,
  resendOtp,
} from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
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
      const response = await loginWithOtp({ identifier: pendingIdentifier, code })
      const tokens = getAuthTokens(response)
      if (tokens) {
        await setTokens(tokens)
      }
      if (inviteToken) {
        const inviteResponse = await acceptInvite(inviteToken)
        const inviteTokens = getAuthTokens(inviteResponse)
        if (inviteTokens) {
          await setTokens(inviteTokens)
        }
        setPending({ inviteToken: null })
        return goTo(routeForNextStep(inviteResponse.nextStep))
      }
      return goTo(routeForNextStep(response.nextStep))
    } catch (error) {
      setError(getApiErrorMessage(error, t('otp.invalid')))
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
      const response = await resendOtp({ identifier: pendingIdentifier, type: OtpType.LOGIN })
      setPending({
        otpMessage: null,
        maskedPhone: getAuthMaskedPhone(response),
        otpExpiresIn: getAuthOtpExpiresIn(response),
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
