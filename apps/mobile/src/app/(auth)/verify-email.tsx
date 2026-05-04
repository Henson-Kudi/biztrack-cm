import { useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { AuthCard } from '../../components/auth/AuthCard'
import { AuthHeader } from '../../components/auth/AuthHeader'
import { OtpResendTimer } from '../../components/auth/OtpResendTimer'
import { OtpInput } from '../../components/ui/OtpInput'
import { AppButton } from '../../components/ui/AppButton'
import { AppInput } from '../../components/ui/AppInput'
import { useAuthStore } from '../../store/useAuthStore'
import { verifyEmail, resendOtp } from '../../services/auth.service'
import { handleNextStep } from '../../navigation/nextStepRouter'
import type { Locale } from '../../store/useAuthStore'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

const T = {
  fr: {
    title: "Vérification de l'email",
    subtitleKnown: (masked: string) => `Code envoyé à ${masked}`,
    subtitleUnknown: 'Confirmez votre adresse email',
    step: (type: string) => type === 'register' ? 'Étape 3 · Vérifiez votre email' : 'Confirmez votre identité',
    prompt: 'Entrez le code à 6 chiffres reçu par email',
    // Login-flow email prompt
    emailPromptLabel: 'Adresse email associée à votre compte',
    emailPromptHint: (masked: string) => masked ? `Votre email ressemble à : ${masked}` : 'Entrez votre adresse email',
    emailPromptPlaceholder: 'jean@example.com',
    emailConfirmBtn: 'Confirmer',
    // Errors
    invalidOtp: 'Code invalide.',
    expiredCode: 'Code invalide ou expiré. Demandez un nouveau code si nécessaire.',
    lockedCode: 'Trop de tentatives. Demandez un nouveau code pour débloquer.',
    attemptsLeft: (n: number) => `${n} tentative(s) restante(s)`,
    maxAttempts: 'Trop de tentatives. Demandez un nouveau code.',
    resend: 'Renvoyer le code',
    resendHint: 'Renvoyer dans',
    errorNotFound: 'Email introuvable. Vérifiez votre adresse et réessayez.',
    errorInvalidCreds: 'Adresse email incorrecte ou non associée à ce compte.',
    networkError: 'Erreur réseau. Réessayez.',
  },
  en: {
    title: 'Email verification',
    subtitleKnown: (masked: string) => `Code sent to ${masked}`,
    subtitleUnknown: 'Confirm your email address',
    step: (type: string) => type === 'register' ? 'Step 3 · Verify your email' : 'Confirm your identity',
    prompt: 'Enter the 6-digit code sent by email',
    // Login-flow email prompt
    emailPromptLabel: 'Email address linked to your account',
    emailPromptHint: (masked: string) => masked ? `Your email looks like: ${masked}` : 'Enter your email address',
    emailPromptPlaceholder: 'john@example.com',
    emailConfirmBtn: 'Confirm',
    // Errors
    invalidOtp: 'Invalid code.',
    expiredCode: 'Invalid or expired code. Request a new one if needed.',
    lockedCode: 'Too many attempts. Request a new code to unlock.',
    attemptsLeft: (n: number) => `${n} attempt(s) remaining`,
    maxAttempts: 'Too many attempts. Request a new code.',
    resend: 'Resend code',
    resendHint: 'Resend in',
    errorNotFound: 'Email not found. Check your address and try again.',
    errorInvalidCreds: 'Incorrect email or not linked to this account.',
    networkError: 'Network error. Try again.',
  },
} as const

export default function VerifyEmailScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    email?: string         // set in registration flow (real email)
    maskedEmail?: string   // set in login flow (display only)
    identifier?: string    // set in login flow (phone number, for resend)
    type?: string
    inviteToken?: string
  }>()
  const { locale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  const type = params.type ?? ''

  // Registration flow: email is pre-filled and known.
  // Login flow: email param is empty; user must type their actual email.
  const prefilledEmail = params.email ?? ''
  const maskedEmail = params.maskedEmail ?? ''
  const isLoginFlow = type === 'login' && !prefilledEmail

  const [confirmedEmail, setConfirmedEmail] = useState(prefilledEmail)
  const [emailInput, setEmailInput] = useState('')
  const [emailConfirmed, setEmailConfirmed] = useState(!!prefilledEmail)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [otpKey, setOtpKey] = useState(0)
  const resetOtp = () => setOtpKey((k) => k + 1)

  // The actual email used for API calls
  const activeEmail = emailConfirmed ? confirmedEmail : ''

  const handleConfirmEmail = () => {
    const trimmed = emailInput.trim().toLowerCase()
    if (!trimmed) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      setError(t.errorInvalidCreds)
      return
    }
    setConfirmedEmail(trimmed)
    setEmailConfirmed(true)
    setError(null)
  }

  const handleComplete = async (otp: string) => {
    if (loading || !activeEmail) return
    setError(null)
    setLoading(true)

    try {
      const res = await verifyEmail({
        email: activeEmail,
        code: otp,
        inviteToken: params.inviteToken,
      })
      handleNextStep(res, router)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'ApiError') {
        const apiErr = err as {
          status?: number
          data?: { message?: string, error?: { code?: string, details?: { attemptsLeft?: number } } }
        }
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
        } else if (code === 'INVALID_CREDENTIALS' || code === 'USER_NOT_FOUND') {
          // The email they entered doesn't match any account — let them re-enter
          setError(t.errorInvalidCreds)
          if (isLoginFlow) {
            setEmailConfirmed(false)
            setConfirmedEmail('')
          }
        } else if (code === 'EMAIL_NOT_FOUND') {
          setError(t.errorNotFound)
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
      const identifier = activeEmail || params.identifier || ''
      if (!identifier) return
      await resendOtp({ identifier, type: 'VERIFY_EMAIL' })
      resetOtp()
      setLocked(false)
    } catch {
      setError(t.networkError)
    }
  }

  const emailDomain = confirmedEmail.includes('@') ? confirmedEmail.split('@')[1] : ''
  const subtitle = emailConfirmed && confirmedEmail
    ? t.subtitleKnown(maskedEmail || (emailDomain ? `${confirmedEmail[0]}***@${emailDomain}` : `${confirmedEmail[0]}***`))
    : t.subtitleUnknown

  return (
    <View style={{ flex: 1, backgroundColor: '#042C53' }}>
      <AuthHeader title={t.title} subtitle={subtitle} showLogo={false} />
      <AuthCard>
        {/* Step label */}
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

        {/* LOGIN FLOW — user must confirm their email before we can proceed */}
        {isLoginFlow && !emailConfirmed ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, color: '#888780', textAlign: 'center' }}>
              {t.emailPromptHint(maskedEmail)}
            </Text>

            {error ? (
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
                {error}
              </Text>
            ) : null}

            <AppInput
              label={t.emailPromptLabel}
              placeholder={t.emailPromptPlaceholder}
              value={emailInput}
              onChangeText={setEmailInput}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              hint={t.emailPromptHint(maskedEmail)}
              accessibilityLabel={t.emailPromptLabel}
              onSubmitEditing={handleConfirmEmail}
              returnKeyType="done"
            />
            <AppButton
              variant="primary"
              size="md"
              fullWidth
              onPress={handleConfirmEmail}
              accessibilityLabel={t.emailConfirmBtn}
            >
              {t.emailConfirmBtn}
            </AppButton>
          </View>
        ) : (
          /* REGISTRATION FLOW or after email confirmed in login flow */
          <>
            <Text style={{ fontSize: 13, color: '#888780', textAlign: 'center' }}>
              {t.prompt}
            </Text>

            {error ? (
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
                {error}
              </Text>
            ) : null}

            <OtpInput
              key={otpKey}
              onComplete={handleComplete}
              error={undefined}
              disabled={loading || !activeEmail || locked}
              autoFocus={!!activeEmail && !locked}
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
          </>
        )}
      </AuthCard>
    </View>
  )
}
