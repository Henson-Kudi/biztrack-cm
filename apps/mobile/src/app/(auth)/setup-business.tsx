import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuthCard } from '../../components/auth/AuthCard'
import { AuthHeader } from '../../components/auth/AuthHeader'
import { AppButton } from '../../components/ui/AppButton'
import { AppInput } from '../../components/ui/AppInput'
import { useAuthStore } from '../../store/useAuthStore'
import { setupBusiness, BusinessType } from '../../services/auth.service'
import { useForm } from '../../hooks/useForm'
import { decodeJwtSub } from '../../utils/jwt'
import type { Locale } from '../../store/useAuthStore'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

// ─── Steps progress bar ────────────────────────────────────────────────────────
const StepsBar: React.FC<{ current: number; total: number; locale: 'fr' | 'en' }> = ({
  current,
  total,
  locale,
}) => (
  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20, alignItems: 'center' }}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: i < current ? '#185FA5' : '#D3D1C7',
        }}
      />
    ))}
    <Text style={{ fontSize: 11, color: '#888780', marginLeft: 4 }}>
      {locale === 'fr' ? `Étape ${current}/${total}` : `Step ${current}/${total}`}
    </Text>
  </View>
)

// ─── i18n ─────────────────────────────────────────────────────────────────────
const T = {
  fr: {
    title: 'Votre business',
    subtitle: 'Quelques infos pour commencer',
    nameLabel: 'Nom du business',
    namePlaceholder: "Boutique Étoile",
    typeLabel: 'Type de business',
    typePlaceholder: 'Sélectionner…',
    cityLabel: 'Ville',
    cityPlaceholder: 'Douala',
    cta: 'Continuer',
    errorRequired: 'Ce champ est requis',
    done: 'Confirmer',
    businessTypes: [
      { label: 'Épicerie', value: 'EPICERIE' },
      { label: 'Boutique', value: 'BOUTIQUE' },
      { label: 'Restaurant', value: 'RESTAURANT' },
      { label: 'Pharmacie', value: 'PHARMACIE' },
      { label: 'Salon', value: 'SALON' },
      { label: 'Électronique', value: 'ELECTRONIQUE' },
      { label: 'Autre', value: 'AUTRE' },
    ],
  },
  en: {
    title: 'Your business',
    subtitle: 'A few details to get started',
    nameLabel: 'Business name',
    namePlaceholder: 'My Shop',
    typeLabel: 'Business type',
    typePlaceholder: 'Select…',
    cityLabel: 'City',
    cityPlaceholder: 'Douala',
    cta: 'Continue',
    errorRequired: 'This field is required',
    done: 'Confirm',
    businessTypes: [
      { label: 'Grocery', value: 'EPICERIE' },
      { label: 'Boutique', value: 'BOUTIQUE' },
      { label: 'Restaurant', value: 'RESTAURANT' },
      { label: 'Pharmacy', value: 'PHARMACIE' },
      { label: 'Salon', value: 'SALON' },
      { label: 'Electronics', value: 'ELECTRONIQUE' },
      { label: 'Other', value: 'AUTRE' },
    ],
  },
} as const

// ─── Inline picker sheet ──────────────────────────────────────────────────────
interface PickerSheetProps {
  visible: boolean
  options: { label: string; value: string }[]
  selected: string | null
  onSelect: (value: string) => void
  onClose: () => void
  doneLabel: string
}

const PickerSheet: React.FC<PickerSheetProps> = ({
  visible,
  options,
  selected,
  onSelect,
  onClose,
  doneLabel,
}) => {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tap backdrop to dismiss */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          {/* Stop taps on the sheet from propagating to the backdrop */}
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: '65%',
              }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ width: 40, height: 4, backgroundColor: '#D3D1C7', borderRadius: 2 }} />
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                {options.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => onSelect(opt.value)}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottomWidth: 1,
                      borderBottomColor: '#F1EFE8',
                    }}
                  >
                    <Text style={{ fontSize: 15, color: selected === opt.value ? '#185FA5' : '#444441' }}>
                      {opt.label}
                    </Text>
                    {selected === opt.value ? (
                      <Text style={{ color: '#185FA5', fontSize: 16 }}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Confirm button — lifted above native nav bar via safe area */}
              <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom + 8, 20) }}>
                <TouchableOpacity
                  onPress={onClose}
                  style={{
                    backgroundColor: '#185FA5',
                    borderRadius: 12,
                    paddingVertical: 13,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '500', fontSize: 14 }}>{doneLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SetupBusinessScreen() {
  const router = useRouter()
  const { locale, user } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  // Build a locale-aware default name, accounting for null/empty user.name
  const buildDefaultName = (): string => {
    if (!user?.name?.trim()) return ''
    return loc === 'fr' ? `Commerce de ${user.name}` : `${user.name}'s Business`
  }

  const [name, setName] = useState(buildDefaultName)
  const [type, setType] = useState<BusinessType | null>(null)
  const [typeLabel, setTypeLabel] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [city, setCity] = useState('')
  const [customType, setCustomType] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const form = useForm({
    name: (v) => v.trim() ? null : t.errorRequired,
    city: (v) => v.trim() ? null : t.errorRequired,
    // type is a picker, not a text field — handled manually below
  })

  const handleContinue = async () => {
    // Clear form-level error before validation so stale errors don't linger
    setErrors((prev) => { const n = { ...prev }; delete n.form; return n })

    // Validate text fields via hook + check picker separately
    const textOk = form.validate({ name, city })
    let typeOk = true
    if (!type) {
      setErrors((prev) => ({ ...prev, type: t.errorRequired }))
      typeOk = false
    } else {
      setErrors((prev) => { const n = { ...prev }; delete n.type; return n })
    }
    if (!textOk || !typeOk || !type) return
    setLoading(true)
    try {
      // setupBusiness returns BusinessEntity — no cast needed
      const biz = await setupBusiness({ name: name.trim(), type, city: city.trim() })

      // Persist business in the store so the layout guard can satisfy its `business` check
      const store = useAuthStore.getState()
      if (biz?.id) {
        store.setBusiness({
          id: biz.id,
          name: biz.name ?? name.trim(),
          plan: (biz.plan as any) ?? 'FREE',
          role: 'OWNER',
        })
      }

      // Ensure user is in the store with the correct onboarding step.
      // If no user exists yet, decode the JWT sub to get a real ID rather than
      // storing id:'' which breaks downstream identity checks.
      const currentUser = store.user
      if (currentUser) {
        store.setUser({ ...currentUser, onboardingStep: 'PLAN_PENDING' })
      } else {
        const userId = decodeJwtSub(store.accessToken) ?? `pending-${Date.now()}`
        store.setUser({ id: userId, name: name.trim(), phone: '', locale: loc, onboardingStep: 'PLAN_PENDING' })
      }

      router.replace('/(auth)/select-plan' as never)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      // Prefer server validation message; fall back to generic network error
      const serverMsg = e?.response?.data?.message
      setErrors({ form: serverMsg ?? (loc === 'fr' ? 'Erreur réseau, réessayez' : 'Network error, try again') })
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
        <StepsBar current={1} total={3} locale={loc} />

        <AppInput
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          value={name}
          onChangeText={(v) => { setName(v); form.touch('name', v) }}
          autoCapitalize="words"
          error={form.errors.name ?? errors.name}
        />

        {/* Business type — custom sheet picker */}
        <View>
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#888780', marginBottom: 4 }}>
            {t.typeLabel}
          </Text>
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            activeOpacity={0.8}
            style={{
              backgroundColor: '#F1EFE8',
              borderWidth: 1.5,
              borderColor: errors.type ? '#E24B4A' : '#D3D1C7',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 11,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 13, color: typeLabel ? '#444441' : '#888780' }}>
              {typeLabel ?? t.typePlaceholder}
            </Text>
            <Text style={{ color: '#888780' }}>▾</Text>
          </TouchableOpacity>
          {errors.type ? (
            <Text style={{ fontSize: 11, color: '#E24B4A', marginTop: 4 }}>{errors.type}</Text>
          ) : null}
        </View>

        {/* 'Other' specify field — only shown when AUTRE is selected */}
        {type === 'AUTRE' && (
          <View>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#888780', marginBottom: 4 }}>
              {loc === 'fr' ? 'Précisez (max 40 caract.)' : 'Specify (max 40 chars)'}
            </Text>
            <TextInput
              value={customType}
              onChangeText={(v) => setCustomType(v.slice(0, 40))}
              placeholder={loc === 'fr' ? 'Ex: Réparation téléphones…' : 'E.g. Phone repair shop…'}
              placeholderTextColor="#888780"
              maxLength={40}
              autoCapitalize="sentences"
              style={{
                backgroundColor: '#F1EFE8',
                borderWidth: 1.5,
                borderColor: '#D3D1C7',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                color: '#444441',
              }}
            />
            <Text style={{ fontSize: 10, color: '#888780', marginTop: 3, textAlign: 'right' }}>
              {customType.length}/40
            </Text>
          </View>
        )}

        <AppInput
          label={t.cityLabel}
          placeholder={t.cityPlaceholder}
          value={city}
          onChangeText={(v) => { setCity(v); form.touch('city', v) }}
          autoCapitalize="words"
          error={form.errors.city ?? errors.city}
        />

        {errors.form ? (
          <Text style={{ fontSize: 12, color: '#E24B4A', textAlign: 'center' }}>{errors.form}</Text>
        ) : null}

        <AppButton variant="primary" size="md" fullWidth loading={loading} onPress={handleContinue}>
          {t.cta}
        </AppButton>
      </AuthCard>

      {/* Type picker bottom sheet */}
      <PickerSheet
        visible={showPicker}
        options={t.businessTypes as unknown as { label: string; value: string }[]}
        selected={type}
        onSelect={(v) => {
          const opt = (t.businessTypes as unknown as { label: string; value: string }[]).find((o) => o.value === v)
          setType(v as BusinessType)
          setTypeLabel(opt?.label ?? null)
          setErrors((e) => ({ ...e, type: '' }))
        }}
        onClose={() => setShowPicker(false)}
        doneLabel={t.done}
      />
    </KeyboardAvoidingView>
  )
}
