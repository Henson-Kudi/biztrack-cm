import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppBadge } from '../../components/ui/AppBadge'
import { AppSpinner } from '../../components/ui/AppSpinner'
import { useAuthStore } from '../../store/useAuthStore'
import { getMyBusinesses, selectBusiness, BusinessListItem } from '../../services/auth.service'
import { handleNextStep } from '../../navigation/nextStepRouter'
import type { BadgeVariant } from '../../components/ui/AppBadge'
import type { Locale } from '../../store/useAuthStore'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

const T = {
  fr: {
    title: 'Choisir un business',
    subtitle: 'Sélectionnez le business auquel vous connecter',
    empty: 'Aucun business trouvé.',
    error: 'Erreur de chargement.',
    pending: 'En attente',
  },
  en: {
    title: 'Choose a business',
    subtitle: 'Select the business to sign in to',
    empty: 'No businesses found.',
    error: 'Loading error.',
    pending: 'Pending',
  },
} as const

const ROLE_BADGE: Record<string, BadgeVariant> = {
  OWNER: 'owner',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  ACCOUNTANT: 'accountant',
}

export default function SelectBusinessScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { locale } = useAuthStore()
  const loc = safeLocale(locale)
  const t = T[loc]

  const [businesses, setBusinesses] = useState<BusinessListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const handleSelect = async (businessId: string) => {
    if (!mountedRef.current) return
    setSelecting(businessId)
    try {
      const res = await selectBusiness({ businessId })
      if (mountedRef.current) handleNextStep(res, router)
    } catch {
      if (mountedRef.current) {
        setSelecting(null)
        setError(t.error)
      }
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const { businesses: list } = await getMyBusinesses()
        if (!mountedRef.current) return

        setBusinesses(list)

        // Auto-select if exactly one active business
        const active = list.filter((b) => b.status === 'ACTIVE')
        if (active.length === 1 && active[0]) {
          await handleSelect(active[0].id)
        }
      } catch {
        if (mountedRef.current) setError(t.error)
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: '#F1EFE8' }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: '#042C53',
          paddingTop: insets.top + 16,
          paddingBottom: 22,
          paddingHorizontal: 20,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '500', color: '#FFFFFF' }}>{t.title}</Text>
        <Text style={{ fontSize: 12, color: '#85B7EB', marginTop: 4 }}>{t.subtitle}</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppSpinner size="lg" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text
            style={{ color: '#E24B4A', textAlign: 'center' }}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        </View>
      ) : businesses.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#888780', textAlign: 'center' }}>{t.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => {
            const isSelecting = selecting === item.id
            const roleBadge = ROLE_BADGE[item.role] ?? 'manager'
            const isPending = item.status === 'PENDING'

            return (
              <TouchableOpacity
                onPress={() => handleSelect(item.id)}
                disabled={Boolean(selecting)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} — ${item.role}`}
                accessibilityState={{ disabled: Boolean(selecting) }}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#D3D1C7',
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: '#444441' }}>
                    {item.name}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <AppBadge variant={roleBadge} />
                    {isPending ? (
                      <AppBadge variant="pending" label={t.pending} />
                    ) : null}
                  </View>
                </View>

                {isSelecting ? (
                  <ActivityIndicator size="small" color="#185FA5" />
                ) : (
                  <Text style={{ fontSize: 18, color: '#888780' }}>›</Text>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}
