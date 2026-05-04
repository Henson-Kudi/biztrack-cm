import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppButton } from '../../components/ui/AppButton'
import { AppInput } from '../../components/ui/AppInput'
import { useAuthStore } from '../../store/useAuthStore'
import apiClient from '../../services/apiClient'
import { handleNextStep } from '../../navigation/nextStepRouter'
import { useForm } from '../../hooks/useForm'
import type { Locale } from '../../store/useAuthStore'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

const T = {
  fr: {
    title: 'Premier produit',
    subtitle: 'Ajoutez votre premier produit pour commencer',
    nameLabel: 'Nom du produit',
    namePlaceholder: 'Eau Tangui 75cl',
    priceLabel: 'Prix de vente (XAF)',
    pricePlaceholder: '300',
    stockLabel: 'Stock initial',
    stockPlaceholder: '50',
    cta: 'Ajouter et continuer',
    skip: 'Passer cette étape',
    skipping: 'Passage…',
    error: 'Erreur réseau, réessayez',
    errorNameRequired: 'Le nom est requis',
    errorPriceRequired: 'Le prix doit être supérieur à 0',
  },
  en: {
    title: 'First product',
    subtitle: 'Add your first product to get started',
    nameLabel: 'Product name',
    namePlaceholder: 'Water 75cl',
    priceLabel: 'Selling price (XAF)',
    pricePlaceholder: '300',
    stockLabel: 'Initial stock',
    stockPlaceholder: '50',
    cta: 'Add and continue',
    skip: 'Skip this step',
    skipping: 'Skipping…',
    error: 'Network error, try again',
    errorNameRequired: 'Name is required',
    errorPriceRequired: 'Price must be greater than 0',
  },
} as const

export default function FirstProductScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { locale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [loading, setLoading] = useState(false)
  const [skipping, setSkipping] = useState(false)

  const form = useForm({
    name:  (v) => v.trim() ? null : t.errorNameRequired,
    price: (v) => { const n = Number(v); return (!v || isNaN(n) || n <= 0) ? t.errorPriceRequired : null },
  })

  const handleAdd = async () => {
    if (!form.validate({ name, price })) return
    setLoading(true)
    form.clearErrors()

    try {
      const res: any = await apiClient
        .post('/businesses/first-product', {
          name: name.trim(),
          price: Number(price),
          stock: Number(stock) || 0,
        })
      handleNextStep(res, router)
    } catch {
      form.setFieldError('name', t.error)
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setSkipping(true)
    try {
      const res: any = await apiClient
        .post('/businesses/first-product', { skip: true })
      handleNextStep(res, router)
    } catch {
      // Skip failure — navigate to dashboard anyway (non-blocking step)
      router.replace('/(tabs)' as never)
    } finally {
      setSkipping(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F1EFE8' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: '#042C53',
          paddingTop: insets.top + 16,
          paddingBottom: 24,
          paddingHorizontal: 20,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '500', color: '#FFFFFF' }}>{t.title}</Text>
        <Text style={{ fontSize: 12, color: '#85B7EB', marginTop: 4 }}>{t.subtitle}</Text>

        {/* Step bar — step 3 of 3 */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: '#378ADD',
              }}
            />
          ))}
        </View>
      </View>

      {/* Form card */}
      <View
        style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: 24,
          gap: 16,
        }}
      >
        <AppInput
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          value={name}
          onChangeText={(v) => { setName(v); form.touch('name', v) }}
          autoCapitalize="words"
          error={form.errors.name}
          accessibilityLabel={t.nameLabel}
        />

        <AppInput
          label={t.priceLabel}
          placeholder={t.pricePlaceholder}
          value={price}
          onChangeText={(v) => {
            const cleaned = v.replace(/\D/g, '')
            setPrice(cleaned)
            form.touch('price', cleaned)
          }}
          keyboardType="number-pad"
          error={form.errors.price}
          accessibilityLabel={t.priceLabel}
          leftSlot={
            <Text style={{ fontSize: 12, color: '#888780', fontWeight: '500' }}>XAF</Text>
          }
        />

        <AppInput
          label={t.stockLabel}
          placeholder={t.stockPlaceholder}
          value={stock}
          onChangeText={(v) => setStock(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          accessibilityLabel={t.stockLabel}
        />

        {(form.errors as any).form ? (
          <Text
            style={{ fontSize: 12, color: '#E24B4A', textAlign: 'center' }}
            accessibilityRole="alert"
          >
            {(form.errors as any).form}
          </Text>
        ) : null}

        <AppButton
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          onPress={handleAdd}
          accessibilityLabel={t.cta}
        >
          {t.cta}
        </AppButton>

        <TouchableOpacity
          onPress={handleSkip}
          disabled={skipping || loading}
          style={{ alignItems: 'center', paddingVertical: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t.skip}
          accessibilityState={{ disabled: skipping || loading }}
        >
          <Text style={{ fontSize: 13, color: '#888780', textDecorationLine: 'underline' }}>
            {skipping ? t.skipping : t.skip}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
