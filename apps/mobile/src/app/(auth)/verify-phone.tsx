import { useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { AuthCard } from '../../components/auth/AuthCard'
import { AuthHeader } from '../../components/auth/AuthHeader'
import { OtpResendTimer } from '../../components/auth/OtpResendTimer'
import { OtpInput } from '../../components/ui/OtpInput'
import { useAuthStore } from '../../store/useAuthStore'
import { verifyPhone, resendOtp } from '../../services/auth.service'
import { handleNextStep } from '../../navigation/nextStepRouter'
import type { Locale } from '../../store/useAuthStore'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

const T = {
  fr: {
    title: 'Vérification du téléphone',
    subtitle: (masked: string) => masked ? `Code envoyé au ${masked}` : 'Code envoyé à votre numéro',
    step: (type: string) => type === 'register' ? 'Étape 2 · Vérifiez votre téléphone' : 'Confirmez votre identité',
    prompt: 'Entrez le code à 6 chiffres reçu par SMS',
    invalidOtp: 'Code invalide.',
    expiredCode: 'Code invalide ou expiré. Demandez un nouveau code si nécessaire.',
    lockedCode: 'Trop de tentatives. Demandez un nouveau code pour débloquer.',
    attemptsLeft: (n: number) => `${n} tentative(s) restante(s)`,
    maxAttempts: 'Trop de tentatives. Demandez un nouveau code.',
    resend: 'Renvoyer le code',
    resendHint: 'Renvoyer dans',
    missingPhone: 'Numéro introuvable. Revenez en arrière.',
    networkError: 'Erreur réseau. Réessayez.',
  },
  en: {
    title: 'Phone verification',
    subtitle: (masked: string) => masked ? `Code sent to ${masked}` : 'Code sent to your number',
    step: (type: string) => type === 'register' ? 'Step 2 · Verify your phone' : 'Confirm your identity',
    prompt: 'Enter the 6-digit code sent by SMS',
    invalidOtp: 'Invalid code.',
    expiredCode: 'Invalid or expired code. Request a new one if needed.',
    lockedCode: 'Too many attempts. Request a new code to unlock.',
    attemptsLeft: (n: number) => `${n} attempt(s) remaining`,
    maxAttempts: 'Too many attempts. Request a new code.',
    resend: 'Resend code',
    resendHint: 'Resend in',
    missingPhone: 'Phone number missing. Please go back.',
    networkError: 'Network error. Try again.',
  },
} as const

export default function VerifyPhoneScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    phone?: string
    type?: string
    inviteToken?: string
    maskedPhone?: string
    email?: string          // threaded from register → here → verify-email
  }>()
  const { locale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  const phone = params.phone ?? ''
  const maskedPhone = params.maskedPhone ?? phone
  const type = params.type ?? ''

  // Don't show red error boxes on mount — only block the input silently
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [otpKey, setOtpKey] = useState(0)
  const resetOtp = () => setOtpKey((k) => k + 1)

  const handleComplete = async (otp: string) => {
    if (loading || !phone) return
    setError(null)
    setLoading(true)

    try {
      const res = await verifyPhone({
        phone,
        code: otp,
        inviteToken: params.inviteToken,
      })
      // Forward the email so verify-email screen has the real identifier
      handleNextStep(res, router, {
        phone,
        email: params.email,
        inviteToken: params.inviteToken,
      })
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
      await resendOtp({ identifier: phone, type: 'VERIFY_PHONE' })
      resetOtp()
      setLocked(false)
    } catch {
      setError(t.networkError)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#042C53' }}>
      <AuthHeader title={t.title} subtitle={t.subtitle(maskedPhone)} showLogo={false} />
      <AuthCard>
        {/* Contextual step label */}
        <Text style={{
          fontSize: 11,
          fontWeight: '600',
          color: '#185FA5',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}>
          {t.step(type)}
        </Text>

        <Text style={{ fontSize: 13, color: '#888780', textAlign: 'center' }}>
          {t.prompt}
        </Text>

        {/* Show missing-phone as a warning banner, not via OTP error */}
        {!phone ? (
          <Text style={{
            fontSize: 13,
            color: '#E24B4A',
            textAlign: 'center',
            backgroundColor: 'rgba(226,75,74,0.08)',
            borderRadius: 8,
            padding: 12,
          }}
            accessibilityRole="alert"
          >
            {t.missingPhone}
          </Text>
        ) : null}

        <OtpInput
          key={otpKey}
          onComplete={handleComplete}
          error={error ?? undefined}
          disabled={loading || !phone || locked}
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
