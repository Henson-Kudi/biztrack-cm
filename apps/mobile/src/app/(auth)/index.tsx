import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { AuthCard } from '../../components/auth/AuthCard'
import { AuthHeader } from '../../components/auth/AuthHeader'
import { AppButton } from '../../components/ui/AppButton'
import { LanguagePicker, Locale } from '../../components/ui/LanguagePicker'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { useAuthStore } from '../../store/useAuthStore'
import { requestLogin } from '../../services/auth.service'
import { ApiError } from '../../services/apiClient'
import { validateCMRPhone } from '@biztrack/validators'

// ─── i18n strings ────────────────────────────────────────────────────────────
const T = {
  fr: {
    subtitle: 'Gérez votre business,\nmême sans internet',
    langLabel: 'Langue / Language',
    phoneLabel: 'Numéro de téléphone',
    cta: 'Recevoir le code OTP',
    footer: 'MTN MoMo ou Orange Money requis',
    noAccount: 'Pas encore de compte ?',
    register: 'Créer un compte',
    invalidPhone: 'Numéro invalide (ex: 6XX XXX XXX)',
    networkError: "Une erreur s'est produite. Réessayez.",
  },
  en: {
    subtitle: 'Manage your business,\neven without internet',
    langLabel: 'Language / Langue',
    phoneLabel: 'Phone number',
    cta: 'Receive OTP code',
    footer: 'MTN MoMo or Orange Money required',
    noAccount: "Don't have an account?",
    register: 'Create account',
    invalidPhone: 'Invalid number (e.g. 6XX XXX XXX)',
    networkError: 'An error occurred. Try again.',
  },
} as const

// Narrow locale to supported keys — prevents crash on unexpected locale values
const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

export default function EntryScreen() {
  const router = useRouter()
  const { locale, setLocale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clear error when phone changes
  useEffect(() => {
    if (error) setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])

  const handleContinue = async () => {
    // CM format validation via regex
    const identifier = `+237${phone}`
    if (!validateCMRPhone(identifier)) {
      setError(t.invalidPhone)
      return
    }

    setError(null)
    setLoading(true)

    try {
      const res = await requestLogin({ identifier })

      switch (res.nextStep) {
        case 'verify_phone':
          router.push({ pathname: '/(auth)/verify-phone', params: { phone: identifier, type: 'login', maskedPhone: res.context?.maskedPhone ?? '' } })
          break
        case 'verify_email':
          // Don't pass maskedEmail as `email` — the API needs the real email.
          // Pass maskedEmail for display only, and identifier (phone) so the screen can ask the user for their actual email.
          router.push({ pathname: '/(auth)/verify-email', params: { maskedEmail: res.context?.maskedEmail ?? '', identifier, type: 'login' } })
          break
        case 'password_required':
          router.push({ pathname: '/(auth)/password', params: { identifier } })
          break
        case 'confirm_login':
          router.push({ pathname: '/(auth)/otp-login', params: { identifier } })
          break
        case 'register':
          router.push({ pathname: '/(auth)/register', params: { phone: identifier } })
          break
        default:
          // Log unexpected nextStep in dev; don't silently route to register
          if (__DEV__) console.warn(`[EntryScreen] Unexpected nextStep: ${res.nextStep}`)
          setError(t.networkError)
      }
    } catch (err: unknown) {
      // apiClient throws ApiError — check if the server told us to register
      if (err instanceof ApiError || (err && typeof err === 'object' && 'name' in err && err.name === 'ApiError')) {
        const apiErr = err as ApiError
        const body = apiErr.data as { error?: { code?: string, details?: { nextStep?: string } } } | null
        const errCode = body?.error?.code
        const nextStep = body?.error?.details?.nextStep

        if (nextStep === 'REGISTER' || errCode === 'USER_NOT_FOUND') {
          router.push({ pathname: '/(auth)/register', params: { phone: identifier } })
          return
        }
      }
      setError(t.networkError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#042C53' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AuthHeader title="BizTrack CM" subtitle={t.subtitle} showLogo />

      <AuthCard>
        {/* Language picker */}
        <View>
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#888780', marginBottom: 6 }}>
            {t.langLabel}
          </Text>
          <LanguagePicker value={loc} onChange={(l: Locale) => setLocale(l)} />
        </View>

        {/* Phone input */}
        <PhoneInput
          label={t.phoneLabel}
          value={phone}
          onChangeText={setPhone}
          error={error ?? undefined}
        />

        {/* CTA */}
        <AppButton
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          onPress={handleContinue}
          accessibilityLabel={t.cta}
        >
          {t.cta}
        </AppButton>

        {/* Footer */}
        <Text style={{ fontSize: 11, color: '#888780', textAlign: 'center' }}>
          {t.footer}
        </Text>

        {/* Register link */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 4 }}>
          <Text style={{ fontSize: 12, color: '#888780' }}>{t.noAccount}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            accessibilityRole="link"
            accessibilityLabel={t.register}
          >
            <Text style={{ fontSize: 12, color: '#185FA5', fontWeight: '500' }}>
              {t.register}
            </Text>
          </TouchableOpacity>
        </View>
      </AuthCard>
    </KeyboardAvoidingView>
  )
}
