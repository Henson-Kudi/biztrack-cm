import { useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { AuthCard } from '../../components/auth/AuthCard'
import { AuthHeader } from '../../components/auth/AuthHeader'
import { OtpResendTimer } from '../../components/auth/OtpResendTimer'
import { OtpInput } from '../../components/ui/OtpInput'
import { useAuthStore } from '../../store/useAuthStore'
import { loginOtp, resendOtp } from '../../services/auth.service'
import { handleNextStep } from '../../navigation/nextStepRouter'
import type { Locale } from '../../store/useAuthStore'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

const T = {
  fr: {
    title: 'Confirmation',
    subtitle: 'Entrez le code envoyé pour confirmer',
    prompt: 'Entrez le code à 6 chiffres',
    invalidOtp: 'Code invalide.',
    expiredCode: 'Code invalide ou expiré. Demandez un nouveau code si nécessaire.',
    lockedCode: 'Trop de tentatives. Demandez un nouveau code pour débloquer.',
    attemptsLeft: (n: number) => `${n} tentative(s) restante(s)`,
    maxAttempts: 'Trop de tentatives. Demandez un nouveau code.',
    resend: 'Renvoyer le code',
    resendHint: 'Renvoyer dans',
    missingIdentifier: 'Identifiant manquant. Revenez en arrière.',
    networkError: 'Erreur réseau. Réessayez.',
  },
  en: {
    title: 'Confirmation',
    subtitle: 'Enter the code sent to confirm your login',
    prompt: 'Enter the 6-digit code',
    invalidOtp: 'Invalid code.',
    expiredCode: 'Invalid or expired code. Request a new one if needed.',
    lockedCode: 'Too many attempts. Request a new code to unlock.',
    attemptsLeft: (n: number) => `${n} attempt(s) remaining`,
    maxAttempts: 'Too many attempts. Request a new code.',
    resend: 'Resend code',
    resendHint: 'Resend in',
    missingIdentifier: 'Missing identifier. Please go back.',
    networkError: 'Network error. Try again.',
  },
} as const

export default function OtpLoginScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ identifier?: string }>()
  const { locale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  // Guard against missing identifier
  const identifier = params.identifier ?? ''

  const [error, setError] = useState<string | null>(
    !identifier ? t.missingIdentifier : null
  )
  const [loading, setLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [otpKey, setOtpKey] = useState(0)
  const resetOtp = () => setOtpKey((k) => k + 1)

  const handleComplete = async (otp: string) => {
    if (loading || !identifier) return
    setError(null)
    setLoading(true)

    try {
      const res = await loginOtp({ identifier, code: otp })
      handleNextStep(res, router, { identifier })
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'ApiError') {
        const apiErr = err as { data?: { message?: string, error?: { code?: string, details?: { attemptsLeft?: number } } } }
        const code = apiErr.data?.error?.code
        const attemptsLeft = apiErr.data?.error?.details?.attemptsLeft

        if (code === 'OTP_LOCKED') {
          resetOtp()
          setLocked(true)
          setError(t.lockedCode)
        } else if (code === 'OTP_MAX_ATTEMPTS') {
          resetOtp()
          setLocked(true)
          setError(t.maxAttempts)
        } else if (code === 'INVALID_CODE') {
          resetOtp()
          setError(t.expiredCode)
        } else if (typeof attemptsLeft === 'number') {
          setError(`${t.invalidOtp} ${t.attemptsLeft(attemptsLeft)}`)
        } else if (code === 'INVALID_OTP') {
          setError(t.invalidOtp)
        } else {
          setError(t.networkError)
        }
      } else {
        setError(t.networkError)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    try {
      await resendOtp({ identifier, type: 'LOGIN' })
      resetOtp()
      setLocked(false)
    } catch {
      setError(t.networkError)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#042C53' }}>
      <AuthHeader title={t.title} subtitle={t.subtitle} showLogo={false} />
      <AuthCard>
        <Text style={{ fontSize: 13, color: '#888780', textAlign: 'center' }}>
          {t.prompt}
        </Text>
        <OtpInput
          key={otpKey}
          onComplete={handleComplete}
          error={error ?? undefined}
          disabled={loading || !identifier || locked}
          autoFocus
        />
        <OtpResendTimer
          onResend={handleResend}
          resendLabel={t.resend}
          timerLabel={(s) => {
            const m = Math.floor(s / 60)
            const sec = s % 60
            return `${t.resendHint} ${m}:${sec.toString().padStart(2, '0')}`
          }}
        />
      </AuthCard>
    </View>
  )
}
