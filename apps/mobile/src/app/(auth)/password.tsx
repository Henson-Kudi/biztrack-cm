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
import { useAuthStore } from '../../store/useAuthStore'
import { login } from '../../services/auth.service'
import { handleNextStep } from '../../navigation/nextStepRouter'
import type { Locale } from '../../store/useAuthStore'
import { Ionicons } from '@expo/vector-icons'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

const T = {
  fr: {
    title: 'Connexion',
    subtitle: 'Entrez votre mot de passe',
    passwordLabel: 'Mot de passe',
    cta: 'Se connecter',
    forgot: 'Mot de passe oublié ?',
    missingIdentifier: 'Identifiant manquant. Revenez en arrière.',
    attemptsLeft: (n: number) => `Identifiants invalides. ${n} tentative(s) restante(s).`,
    locked: (time: string) => `Compte bloqué. Réessayez après ${time}.`,
    networkErr: 'Erreur réseau, réessayez.',
    hide: 'Masquer',
    show: 'Voir',
  },
  en: {
    title: 'Sign in',
    subtitle: 'Enter your password',
    passwordLabel: 'Password',
    cta: 'Sign in',
    forgot: 'Forgot password?',
    missingIdentifier: 'Missing identifier. Please go back.',
    attemptsLeft: (n: number) => `Invalid credentials. ${n} attempt(s) remaining.`,
    locked: (time: string) => `Account locked. Try again after ${time}.`,
    networkErr: 'Network error, try again.',
    hide: 'Hide',
    show: 'Show',
  },
} as const

export default function PasswordScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ identifier?: string }>()
  const { locale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  // Guard against missing identifier
  const identifier = params.identifier ?? ''

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(
    !identifier ? t.missingIdentifier : null
  )
  const [loading, setLoading] = useState(false)
  // Store lockUntil as Date so we can reset it correctly
  const [lockUntilDate, setLockUntilDate] = useState<Date | null>(null)

  const isLocked = lockUntilDate !== null && lockUntilDate > new Date()

  useEffect(() => {
    if (!lockUntilDate) return
    const now = new Date()
    if (lockUntilDate <= now) {
      setLockUntilDate(null)
      setError(null)
      return
    }
    const msUntilUnlock = lockUntilDate.getTime() - now.getTime()
    const timer = setTimeout(() => {
      setLockUntilDate(null)
      setError(null)
    }, msUntilUnlock)
    return () => clearTimeout(timer)
  }, [lockUntilDate])

  const formatLockTime = (date: Date): string => {
    try {
      return date.toLocaleTimeString(loc === 'fr' ? 'fr-CM' : 'en-CM', {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      // Fallback if locale-specific formatting fails
      return date.toLocaleTimeString()
    }
  }

  const handleLogin = async () => {
    if (!password || !identifier || isLocked) return
    setError(null)
    setLoading(true)

    try {
      const res = await login({ identifier, password })
      // Successful login — clear any stale lock state
      setLockUntilDate(null)
      handleNextStep(res, router, { identifier })
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'ApiError') {
        const apiErr = err as {
          data?: {
            message?: string
            error?: {
              code?: string
              details?: { attemptsLeft?: number; lockUntil?: string | number }
            }
          }
        }
        
        const code = apiErr.data?.error?.code
        const attemptsLeft = apiErr.data?.error?.details?.attemptsLeft
        const lockUntilVal = apiErr.data?.error?.details?.lockUntil
        
        if (code === 'ACCOUNT_LOCKED' && lockUntilVal) {
          // Parse and validate the date before using it
          const parsed = new Date(lockUntilVal)
          if (!isNaN(parsed.getTime())) {
            setLockUntilDate(parsed)
            setError(t.locked(formatLockTime(parsed)))
          } else {
            // Invalid date from server — show generic error
            setError(t.networkErr)
          }
        } else if (code === 'INVALID_CREDENTIALS' && typeof attemptsLeft === 'number') {
          // Failed login attempt — stale lock is no longer valid
          setLockUntilDate(null)
          setError(t.attemptsLeft(attemptsLeft))
        } else {
          setError(t.networkErr)
        }
      } else {
        setError(t.networkErr)
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

      <AuthCard>
        {/* Identifier display (read-only) */}
        <View
          style={{
            backgroundColor: '#F1EFE8',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
          accessibilityLabel={`Signing in as ${identifier}`}
        >
          <Text style={{ fontSize: 13, color: '#888780' }}>
            {identifier || t.missingIdentifier}
          </Text>
        </View>

        {/* Password */}
        <AppInput
          label={t.passwordLabel}
          placeholder="••••••••"
          value={password}
          onChangeText={(v) => {
            setPassword(v)
            // Clear stale lock error when user starts typing a new password
            if (lockUntilDate && lockUntilDate <= new Date()) {
              setLockUntilDate(null)
              setError(null)
            }
          }}
          secureTextEntry={!showPassword}
          textContentType="password"
          autoComplete="current-password"
          error={error ?? undefined}
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

        {/* Account locked banner */}
        {isLocked ? (
          <View
            style={{ backgroundColor: '#FCEBEB', borderRadius: 10, padding: 12 }}
            accessibilityRole="alert"
          >
            <Text style={{ fontSize: 12, color: '#791F1F', textAlign: 'center' }}>
              {t.locked(formatLockTime(lockUntilDate!))}
            </Text>
          </View>
        ) : null}

        <AppButton
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          disabled={isLocked || !identifier || password.length === 0}
          onPress={handleLogin}
          accessibilityLabel={t.cta}
        >
          {t.cta}
        </AppButton>

        {/* Forgot password — placeholder for future implementation */}
        <TouchableOpacity
          style={{ alignItems: 'center' }}
          onPress={() => {
            // TODO: Navigate to forgot password / OTP reset flow
            if (__DEV__) console.log('[PasswordScreen] Forgot password tapped — not yet implemented')
          }}
          accessibilityRole="button"
          accessibilityLabel={t.forgot}
        >
          <Text style={{ fontSize: 12, color: '#185FA5', textDecorationLine: 'underline' }}>
            {t.forgot}
          </Text>
        </TouchableOpacity>
      </AuthCard>
    </KeyboardAvoidingView>
  )
}
