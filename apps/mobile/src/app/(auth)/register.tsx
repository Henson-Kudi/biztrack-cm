import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import type { Href } from 'expo-router'
import { AuthCard } from '../../components/auth/AuthCard'
import { AuthHeader } from '../../components/auth/AuthHeader'
import { AppButton } from '../../components/ui/AppButton'
import { AppInput } from '../../components/ui/AppInput'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { register } from '../../services/auth.service'
import { useAuthStore } from '../../store/useAuthStore'
import { validateCMRPhone } from '@biztrack/validators'
import { useForm } from '../../hooks/useForm'
import type { Locale } from '../../store/useAuthStore'
import { Ionicons } from '@expo/vector-icons'

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

// ─── i18n strings ────────────────────────────────────────────────────────────
const T = {
  fr: {
    title: 'Créer un compte',
    subtitle: 'Rejoignez BizTrack CM',
    namePlaceholder: 'Jean Dupont',
    nameLabel: 'Nom complet',
    phoneLabel: 'Numéro de téléphone',
    passwordLabel: 'Mot de passe',
    passwordHint: '8+ caractères • Maj • Min • Chiffre • Caractère spécial',
    emailLabel: 'Email (optionnel)',
    emailPlaceholder: 'jean@example.com',
    cta: 'Créer mon compte',
    alreadyHave: 'Déjà un compte ?',
    loginLink: 'Se connecter',
    errorNameRequired: 'Le nom est requis',
    errorNameInvalid: 'Nom invalide (lettres et espaces uniquement)',
    errorPasswordWeak: '8+ caractères avec majuscule, minuscule et chiffre',
    errorPhoneInvalid: 'Numéro invalide (ex: 6XX XXX XXX)',
    errorPhoneExists: 'Un compte avec ce numéro existe déjà.',
    errorEmailInvalid: 'Adresse email invalide',
    errorEmailExists: 'Un compte avec cet email existe déjà.',
    errorNetwork: 'Erreur réseau, réessayez',
    hide: 'Masquer',
    show: 'Voir',
  },
  en: {
    title: 'Create account',
    subtitle: 'Join BizTrack CM',
    namePlaceholder: 'John Doe',
    nameLabel: 'Full name',
    phoneLabel: 'Phone number',
    passwordLabel: 'Password',
    passwordHint: '8+ chars • Uppercase • Lowercase • Number • Special char',
    emailLabel: 'Email (optional)',
    emailPlaceholder: 'john@example.com',
    cta: 'Create my account',
    alreadyHave: 'Already have an account?',
    loginLink: 'Log in',
    errorNameRequired: 'Name is required',
    errorNameInvalid: 'Invalid name (letters and spaces only)',
    errorPasswordWeak: '8+ characters with uppercase, lowercase and a number',
    errorPhoneInvalid: 'Invalid number (e.g. 6XX XXX XXX)',
    errorPhoneExists: 'Phone number already in use',
    errorEmailInvalid: 'Invalid email address',
    errorEmailExists: 'Email already in use',
    errorNetwork: 'Network error, try again',
    hide: 'Hide',
    show: 'Show',
  },
} as const

export default function RegisterScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ phone?: string; inviteToken?: string }>()
  const { locale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  // Strip +237 prefix if present; params.phone may be undefined
  const prefillPhone = (params.phone ?? '').replace('+237', '')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState(prefillPhone)

  useEffect(() => {
    const next = (params.phone ?? '').replace('+237', '')
    if (next && !phone) {
      setPhone(next)
    }
  }, [params.phone, phone])

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Form validation via useForm hook ──────────────────────────────────────────────
  // Rules are recreated with the correct locale strings when locale changes.
  const form = useForm({
    name: (v) =>
      !v.trim() ? t.errorNameRequired
      : !NAME_REGEX.test(v.trim()) ? t.errorNameInvalid
      : null,
    phone: (v) => validateCMRPhone(`+237${v}`) ? null : t.errorPhoneInvalid,
    password: (v) => PASSWORD_REGEX.test(v) ? null : t.errorPasswordWeak,
    email: (v) => (v.trim() && !EMAIL_REGEX.test(v.trim())) ? t.errorEmailInvalid : null,
  })

  const handleRegister = async () => {
    if (!form.validate({ name, phone, password, email })) return
    setLoading(true)

    try {
      const res = await register({
        name: name.trim(),
        phone: `+237${phone}`,
        password,
        email: email.trim() || undefined,
        locale: loc,
        inviteToken: params.inviteToken,
      })

      if (res.nextStep === 'verify_phone') {
        router.push({
          pathname: '/(auth)/verify-phone',
          params: {
            phone: `+237${phone}`,
            type: 'register',
            inviteToken: params.inviteToken,
            maskedPhone: res.context?.maskedPhone ?? '',
            email: email.trim() || '',
          },
        })
      } else {
        // Unexpected nextStep — log and surface error
        if (__DEV__) console.warn(`[RegisterScreen] Unexpected nextStep: ${res.nextStep}`)
        form.setFieldError('form' as any, t.errorNetwork)
      }
    } catch (err: unknown) {
      // Check for ApiError shape
      if (err && typeof err === 'object' && 'name' in err && err.name === 'ApiError') {
        const apiErr = err as { data?: { message?: string, error?: { code?: string } } }
        const code = apiErr.data?.error?.code

        if (code === 'PHONE_IN_USE' || code === 'PHONE_EXISTS') {
          form.setFieldError('phone', t.errorPhoneExists)
        } else if (code === 'EMAIL_IN_USE' || code === 'EMAIL_EXISTS') {
          form.setFieldError('email', t.errorEmailExists)
        } else {
          form.setFieldError('form' as 'name', t.errorNetwork)
        }
      } else {
        form.setFieldError('form' as 'name', t.errorNetwork)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#042C53' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AuthHeader title={t.title} subtitle={t.subtitle} showLogo={false} />

      <AuthCard scrollable>
        <AppInput
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          value={name}
          onChangeText={(v) => { setName(v); form.touch('name', v) }}
          autoCapitalize="words"
          error={form.errors.name}
          accessibilityLabel={t.nameLabel}
        />

        <PhoneInput
          label={t.phoneLabel}
          value={phone}
          onChangeText={(v) => { setPhone(v); form.touch('phone', v) }}
          error={form.errors.phone}
          accessibilityLabel={t.phoneLabel}
        />

        <AppInput
          label={t.passwordLabel}
          placeholder="••••••••"
          value={password}
          onChangeText={(v) => { setPassword(v); form.touch('password', v) }}
          secureTextEntry={!showPassword}
          hint={!form.errors.password ? t.passwordHint : undefined}
          error={form.errors.password}
          accessibilityLabel={t.passwordLabel}
          rightSlot={
            <TouchableOpacity
              onPress={() => setShowPassword((s) => !s)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t.hide : t.show}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color="#185FA5"
              />
            </TouchableOpacity>
          }
        />

        <AppInput
          label={t.emailLabel}
          placeholder={t.emailPlaceholder}
          value={email}
          onChangeText={(v) => { setEmail(v); form.touch('email', v) }}
          keyboardType="email-address"
          autoCapitalize="none"
          error={form.errors.email}
          accessibilityLabel={t.emailLabel}
        />

        {form.errors['form' as keyof typeof form.errors] ? (
          <Text
            style={{ fontSize: 12, color: '#E24B4A', textAlign: 'center' }}
            accessibilityRole="alert"
          >
            {form.errors['form' as keyof typeof form.errors]}
          </Text>
        ) : null}

        <AppButton
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          onPress={handleRegister}
          accessibilityLabel={t.cta}
        >
          {t.cta}
        </AppButton>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12, color: '#888780' }}>{t.alreadyHave}</Text>
          <TouchableOpacity
            onPress={() => router.replace('/(auth)')}
            accessibilityRole="link"
            accessibilityLabel={t.loginLink}
          >
            <Text style={{ fontSize: 12, color: '#185FA5', fontWeight: '500' }}>
              {t.loginLink}
            </Text>
          </TouchableOpacity>
        </View>
      </AuthCard>
    </KeyboardAvoidingView>
  )
}
