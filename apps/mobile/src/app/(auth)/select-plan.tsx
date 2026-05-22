import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { AppButton } from '../../components/ui/AppButton'
import { AppSpinner } from '../../components/ui/AppSpinner'
import { useAuthStore } from '../../store/useAuthStore'
import { getPlans, selectPlan, PlanOption, SubscriptionPlan } from '../../services/auth.service'
import { decodeJwtSub } from '../../utils/jwt'
import type { Locale } from '../../store/useAuthStore'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const safeLocale = (l: string): Locale =>
  SUPPORTED_LOCALES.includes(l as Locale) ? (l as Locale) : 'fr'

// ─── i18n ─────────────────────────────────────────────────────────────────────
const T = {
  fr: {
    title: 'Choisissez votre plan',
    subtitle: 'Commencez gratuitement, évoluez selon vos besoins',
    free: 'Gratuit',
    perMonth: '/mois',
    trial: (n: number) => `${n} jours gratuits`,
    popular: '🔥 Le plus populaire',
    select: (plan: string) => `Choisir ${plan}`,
    loading: 'Chargement des plans…',
    errorLoad: 'Erreur de chargement.',
    included: 'Inclus avec FREE :',
    plus: 'En plus de FREE :',
    retry: 'Réessayer',
    moreFeatures: (n: number) => `+ ${n} fonctionnalité(s)`,
    networkError: 'Erreur réseau, réessayez',
  },
  en: {
    title: 'Choose your plan',
    subtitle: 'Start free, upgrade as you grow',
    free: 'Free',
    perMonth: '/mo',
    trial: (n: number) => `${n} days free`,
    popular: '🔥 Most popular',
    select: (plan: string) => `Choose ${plan}`,
    loading: 'Loading plans…',
    errorLoad: 'Loading error.',
    included: 'Included with FREE:',
    plus: 'Plus everything in FREE:',
    retry: 'Try again',
    moreFeatures: (n: number) => `+ ${n} more`,
    networkError: 'Network error, try again',
  },
} as const

// Map Resource enum keys to readable labels (locale-aware)
const RESOURCE_LABELS: Record<'fr' | 'en', Record<string, string>> = {
  fr: {
    SALES_CREATE: 'Enregistrer des ventes',
    SALES_VIEW: 'Historique des ventes',
    SALES_VOID: 'Annuler / rembourser',
    SALES_EXPORT: 'Exporter les ventes',
    PRODUCTS_CREATE: 'Ajouter des produits',
    PRODUCTS_VIEW: 'Voir les produits',
    PRODUCTS_EDIT: 'Modifier les produits',
    PRODUCTS_DELETE: 'Supprimer des produits',
    PRODUCTS_LIMIT_50: "Jusqu'à 50 produits",
    PRODUCTS_UNLIMITED: 'Produits illimités',
    PRODUCTS_IMPORT_CSV: 'Importer via CSV',
    INVENTORY_VIEW: "Voir l'inventaire",
    INVENTORY_ADJUST: 'Ajuster le stock',
    INVENTORY_ALERTS: 'Alertes stock bas',
    EXPENSES_CREATE: 'Enregistrer des dépenses',
    EXPENSES_VIEW: 'Voir les dépenses',
    EXPENSES_CATEGORIES: 'Catégories de dépenses',
    REPORTS_DAILY: 'Rapports journaliers',
    REPORTS_WEEKLY: 'Rapports hebdomadaires',
    REPORTS_MONTHLY: 'Rapports mensuels',
    REPORTS_EXPORT_PDF: 'Exporter en PDF',
    REPORTS_EXPORT_CSV: 'Exporter en CSV',
    RECEIPTS_GENERATE: 'Générer des reçus',
    RECEIPTS_WHATSAPP: 'Envoyer reçu WhatsApp',
    SCANNER_CAMERA: 'Scanner code-barres (caméra)',
    SCANNER_USB: 'Scanner code-barres (USB)',
    DESKTOP_ACCESS: 'Accès application bureau',
    STAFF_INVITE: 'Inviter du personnel',
    STAFF_MANAGE: 'Gérer le personnel',
    STAFF_LIMIT_3: "Jusqu'à 3 employés",
    STAFF_UNLIMITED: 'Employés illimités',
    BRANCHES_MULTI: 'Multi-succursales',
    BRANCHES_DASHBOARD: 'Tableau de bord succursales',
    BRANCHES_REPORTS: 'Rapports par succursale',
    API_ACCESS: 'Accès API',
  },
  en: {
    SALES_CREATE: 'Record sales',
    SALES_VIEW: 'View sales history',
    SALES_VOID: 'Void / refund sales',
    SALES_EXPORT: 'Export sales',
    PRODUCTS_CREATE: 'Add products',
    PRODUCTS_VIEW: 'View products',
    PRODUCTS_EDIT: 'Edit products',
    PRODUCTS_DELETE: 'Delete products',
    PRODUCTS_LIMIT_50: 'Up to 50 products',
    PRODUCTS_UNLIMITED: 'Unlimited products',
    PRODUCTS_IMPORT_CSV: 'Import products via CSV',
    INVENTORY_VIEW: 'View inventory',
    INVENTORY_ADJUST: 'Adjust stock',
    INVENTORY_ALERTS: 'Low stock alerts',
    EXPENSES_CREATE: 'Record expenses',
    EXPENSES_VIEW: 'View expenses',
    EXPENSES_CATEGORIES: 'Expense categories',
    REPORTS_DAILY: 'Daily reports',
    REPORTS_WEEKLY: 'Weekly reports',
    REPORTS_MONTHLY: 'Monthly reports',
    REPORTS_EXPORT_PDF: 'Export reports (PDF)',
    REPORTS_EXPORT_CSV: 'Export reports (CSV)',
    RECEIPTS_GENERATE: 'Generate receipts',
    RECEIPTS_WHATSAPP: 'Send receipts via WhatsApp',
    SCANNER_CAMERA: 'Barcode scanner (camera)',
    SCANNER_USB: 'Barcode scanner (USB)',
    DESKTOP_ACCESS: 'Desktop app access',
    STAFF_INVITE: 'Invite staff',
    STAFF_MANAGE: 'Manage staff',
    STAFF_LIMIT_3: 'Up to 3 staff',
    STAFF_UNLIMITED: 'Unlimited staff',
    BRANCHES_MULTI: 'Multiple branches',
    BRANCHES_DASHBOARD: 'Branch dashboard',
    BRANCHES_REPORTS: 'Branch reports',
    API_ACCESS: 'API access',
  },
}

const PLAN_ACCENT: Record<string, string> = {
  FREE: '#888780',
  SOLO: '#185FA5',
  BUSINESS: '#639922',
  PRO: '#BA7517',
}

export default function SelectPlanScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { locale } = useAuthStore()
  // Hoist safeLocale so it's stable across renders
  const loc = safeLocale(locale)
  const t = T[loc]
  const labels = RESOURCE_LABELS[loc]

  const [plans, setPlans] = useState<PlanOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Extracted fetch function — stable reference, does NOT depend on t.errorLoad
  const fetchPlans = useCallback(() => {
    setError(null)
    setLoading(true)
    getPlans()
      .then(({ plans: p }) => setPlans(p))
      .catch(() => setError(T[loc].errorLoad))
      .finally(() => setLoading(false))
  }, [loc])

  // Only run on mount (and if loc changes, which only happens when user explicitly changes language)
  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const handleSelect = async (plan: PlanOption) => {
    setSelecting(plan.name as SubscriptionPlan)
    setError(null)
    try {
      const res = await selectPlan({ plan: plan.name as SubscriptionPlan })

      // Always update user state — even if user was null (new onboarding)
      const store = useAuthStore.getState()
      const currentUser = store.user
      if (currentUser) {
        store.setUser({ ...currentUser, onboardingStep: 'ADD_FIRST_PRODUCT' })
      } else {
        const userId = decodeJwtSub(store.accessToken) ?? `pending-${Date.now()}`
        store.setUser({ id: userId, name: '', phone: '', locale: loc, onboardingStep: 'ADD_FIRST_PRODUCT' })
      }

      router.replace('/(auth)/first-product' as never)
    } catch {
      setError(t.networkError)
    } finally {
      setSelecting(null)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' }}>
        <AppSpinner size="lg" />
        <Text style={{ color: '#888780', marginTop: 12 }}>{t.loading}</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F1EFE8' }}>
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

        {/* Step bar — step 2 of 3 */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: s <= 2 ? '#378ADD' : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </View>
      </View>

      {error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ color: '#E24B4A' }} accessibilityRole="alert">{error}</Text>
          <AppButton variant="secondary" onPress={fetchPlans}>{t.retry}</AppButton>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.name}
          contentContainerStyle={
            plans.length === 0
              ? { flex: 1, justifyContent: 'center', alignItems: 'center' }
              : { padding: 16, paddingBottom: Math.max(insets.bottom + 20, 40), gap: 12 }
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 20 }}>
              <Text style={{ color: '#888780', textAlign: 'center', marginBottom: 16 }}>
                {loc === 'fr' ? 'Aucun plan disponible pour le moment.' : 'No plans available at the moment.'}
              </Text>
              <AppButton variant="secondary" onPress={fetchPlans}>{t.retry}</AppButton>
            </View>
          }
          renderItem={({ item }) => {
            const accent = PLAN_ACCENT[item.name] ?? '#185FA5'
            const isPopular = item.name === 'SOLO'
            const isPaid = item.priceXAF > 0
            const isSelecting = selecting === item.name
            const features = item.additionalResources.length > 0
              ? item.additionalResources
              : item.resources.slice(0, 6)
            const visibleFeatures = features.slice(0, 6)
            const extraCount = features.length - visibleFeatures.length

            return (
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  borderWidth: isPopular ? 2 : 1,
                  borderColor: isPopular ? accent : '#D3D1C7',
                  overflow: 'hidden',
                }}
              >
                {/* Popular badge */}
                {isPopular ? (
                  <View style={{ backgroundColor: accent, paddingHorizontal: 16, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF' }}>
                      {t.popular}
                    </Text>
                  </View>
                ) : null}

                <View style={{ padding: 16, gap: 14 }}>
                  {/* Plan name + price */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: accent }}>
                        {item.displayName}
                      </Text>
                      {isPaid && item.trialDays > 0 ? (
                        <View
                          style={{
                            backgroundColor: accent + '22',
                            borderRadius: 4,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            marginTop: 4,
                            alignSelf: 'flex-start',
                          }}
                        >
                          <Text style={{ fontSize: 10, color: accent, fontWeight: '500' }}>
                            {t.trial(item.trialDays)}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 22, fontWeight: '600', color: '#444441' }}>
                        {item.priceXAF === 0 ? t.free : `${item.priceXAF.toLocaleString()} XAF`}
                      </Text>
                      {isPaid ? (
                        <Text style={{ fontSize: 11, color: '#888780' }}>{t.perMonth}</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Feature list */}
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 11, color: '#888780', fontStyle: 'italic' }}>
                      {item.inheritsFrom ? t.plus : t.included}
                    </Text>
                    {visibleFeatures.map((resource) => (
                      <View key={resource} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            backgroundColor: accent + '22',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 9, color: accent }}>✓</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: '#444441', flex: 1 }}>
                          {labels[resource] ?? resource}
                        </Text>
                      </View>
                    ))}
                    {extraCount > 0 ? (
                      <Text style={{ fontSize: 11, color: '#888780' }}>
                        {t.moreFeatures(extraCount)}
                      </Text>
                    ) : null}
                  </View>

                  <AppButton
                    variant={isPopular ? 'primary' : 'secondary'}
                    size="md"
                    fullWidth
                    loading={isSelecting}
                    disabled={Boolean(selecting)}
                    onPress={() => handleSelect(item)}
                    accessibilityLabel={t.select(item.displayName)}
                  >
                    {t.select(item.displayName)}
                  </AppButton>
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}
