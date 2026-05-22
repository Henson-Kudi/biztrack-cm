import { View, Text, ScrollView, TouchableOpacity, StatusBar, Platform, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import type { LucideIcon } from 'lucide-react-native'
import {
  ShoppingCart,
  Package,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Plus,
  BarChart2,
  Wallet,
} from 'lucide-react-native'
import { useAuthStore } from '../../store/useAuthStore'

// Safe hex-opacity helper — avoids fragile string concatenation
function addOpacity(hex: string, opacity: string): string {
  if (!hex.startsWith('#')) return hex
  return `${hex}${opacity}`
}

const NAVY = '#042C53'
const BLUE = '#185FA5'
const LIGHT_BLUE = '#378ADD'
const CREAM = '#F1EFE8'
const GREEN = '#639922'
const AMBER = '#BA7517'
const WHITE = '#FFFFFF'
const MUTED = '#888780'
const BORDER = '#D3D1C7'

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View
      style={styles.statCard}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}
    >
      <Text style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color: NAVY }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 10, color, marginTop: 3 }}>{sub}</Text> : null}
    </View>
  )
}

function QuickAction({ icon: Icon, label, color, bg, onPress }: { icon: LucideIcon; label: string; color: string; bg: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={label.replace('\n', ' ')}
      style={{
        alignItems: 'center',
        gap: 8,
        flex: 1,
      }}
    >
      <View style={{
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon size={24} color={color} strokeWidth={1.8} />
      </View>
      <Text style={{ fontSize: 11, color: NAVY, fontWeight: '500', textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  )
}

function MenuRow({ icon: Icon, label, sub, color, onPress }: { icon: any; label: string; sub: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F0EEE8',
      }}
    >
      <View style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: color + '18',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon size={20} color={color} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: NAVY }}>{label}</Text>
        <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{sub}</Text>
      </View>
      <ChevronRight size={16} color={BORDER} />
    </TouchableOpacity>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, business } = useAuthStore()

  const firstName = user?.name?.split(' ')[0] ?? ''

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <StatusBar
        barStyle="light-content"
        {...(Platform.OS === 'android' && { backgroundColor: NAVY })}
      />

      {/* ─── Header ────────────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: NAVY,
        paddingTop: insets.top + 12,
        paddingBottom: 28,
        paddingHorizontal: 20,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ fontSize: 12, color: '#85B7EB', marginBottom: 2 }}>
              {getGreeting()} 👋
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: WHITE }}>
              {firstName || 'Bienvenue'}
            </Text>
            {business ? (
              <Text style={{ fontSize: 11, color: '#6BA3D0', marginTop: 2 }}>
                {business.name} · {business.plan}
              </Text>
            ) : null}
          </View>

          {/* Profile avatar — 1-tap shortcut to Profile */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile' as never)}
            accessibilityRole="button"
            accessibilityLabel="Voir mon profil"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: BLUE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: WHITE }}>
              {user?.name
                ? user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                : '?'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Today summary bar */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: WHITE + '12',
          borderRadius: 12,
          marginTop: 18,
          padding: 14,
          gap: 0,
        }}>
          {[
            { label: "Ventes aujourd'hui", value: '—' },
            { label: 'Transactions', value: '—' },
            { label: 'Dépenses', value: '—' },
          ].map((item, i) => (
            <View key={i} style={{
              flex: 1,
              alignItems: 'center',
              borderLeftWidth: i > 0 ? 1 : 0,
              borderLeftColor: WHITE + '20',
            }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: WHITE }}>{item.value}</Text>
              <Text style={{ fontSize: 9, color: '#85B7EB', marginTop: 2, textAlign: 'center' }}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* ─── Stats row ──────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 10 }}>
            CE MOIS-CI
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard label="Chiffre d'affaires" value="—" sub="Aucune vente" color={MUTED} />
            <StatCard label="Bénéfice net" value="—" sub="Aucune donnée" color={MUTED} />
          </View>
        </View>

        {/* ─── Quick actions ───────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 14 }}>
            ACTIONS RAPIDES
          </Text>
          <View style={{
            backgroundColor: WHITE,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: BORDER,
            padding: 20,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}>
            <QuickAction icon={ShoppingCart} label={'Nouvelle\nvente'} color={BLUE} bg={addOpacity(BLUE, '15')} onPress={() => router.push('/(tabs)/sell' as never)} />
            <QuickAction icon={Plus} label={'Ajouter\nproduit'} color={GREEN} bg={addOpacity(GREEN, '15')} onPress={() => router.push('/(tabs)/products' as never)} />
            <QuickAction icon={Wallet} label={'Dépense'} color={AMBER} bg={addOpacity(AMBER, '15')} onPress={() => router.push('/(tabs)/expenses' as never)} />
            <QuickAction icon={BarChart2} label={'Rapports'} color={'#8B5CF6'} bg={addOpacity('#8B5CF6', '20')} onPress={() => router.push('/(tabs)/reports' as never)} />
          </View>
        </View>

        {/* ─── Activity section ────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 10 }}>
            RACCOURCIS
          </Text>
          <View style={{ backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' }}>
            <MenuRow
              icon={TrendingUp}
              label="Rapport du jour"
              sub="Ventes, dépenses, bénéfice"
              color={BLUE}
              onPress={() => router.push('/(tabs)/reports' as never)}
            />
            <MenuRow
              icon={Package}
              label="Inventaire"
              sub="Stock actuel et alertes"
              color={GREEN}
              onPress={() => router.push('/(tabs)/products' as never)}
            />
            <MenuRow
              icon={AlertCircle}
              label="Dépenses"
              sub="Gérer les sorties de caisse"
              color={AMBER}
              onPress={() => router.push('/(tabs)/expenses' as never)}
            />
          </View>
        </View>

        {/* ─── Recent activity placeholder ─────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 10 }}>
            ACTIVITÉ RÉCENTE
          </Text>
          <View style={{
            backgroundColor: WHITE,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: BORDER,
            alignItems: 'center',
            paddingVertical: 36,
            gap: 8,
          }}>
            <ShoppingCart size={32} color={BORDER} strokeWidth={1.5} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: NAVY }}>Aucune activité récente</Text>
            <Text style={{ fontSize: 12, color: MUTED }}>Commencez par enregistrer une vente</Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/sell' as never)}
              style={{
                marginTop: 8,
                backgroundColor: NAVY,
                borderRadius: 10,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: WHITE }}>Nouvelle vente</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  statCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
})
