import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  User,
  Building2,
  Wallet,
  BarChart2,
  ChevronRight,
  LogOut,
  HelpCircle,
  Settings,
  Shield,
} from 'lucide-react-native'
import { useAuthStore } from '../../store/useAuthStore'
import { Colors, addOpacity } from '../../utils/colors'

const { NAVY, BLUE, GREEN, AMBER, CREAM, WHITE, MUTED, BORDER } = Colors

// ─── Plan badge ───────────────────────────────────────────────────────────────

const PLAN_COLOR: Record<string, string> = {
  FREE:    '#888780',
  STARTER: '#185FA5',
  PRO:     '#639922',
  PREMIUM: '#BA7517',
}

// ─── Section / row components ─────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.6, marginBottom: 6, marginTop: 20, paddingHorizontal: 4 }}>
      {label.toUpperCase()}
    </Text>
  )
}

function MenuRow({
  icon: Icon,
  label,
  sub,
  color,
  onPress,
  danger,
}: {
  icon: any
  label: string
  sub?: string
  color: string
  onPress: () => void
  danger?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 14 }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: addOpacity(color, '15'), alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: danger ? '#E24B4A' : NAVY }}>{label}</Text>
        {sub ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      <ChevronRight size={15} color={BORDER} />
    </TouchableOpacity>
  )
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 66 }} />
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: WHITE,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: BORDER,
      overflow: 'hidden',
      elevation: 1,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 4,
    }}>
      {children}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const router = useRouter()
  const { user, business, logout } = useAuthStore()

  const planColor = PLAN_COLOR[business?.plan ?? 'FREE'] ?? MUTED
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  function handleLogout() {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: logout },
      ],
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: NAVY }}>Plus</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

        {/* ── Profile card ─────────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile' as never)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Voir mon profil"
          style={{
            backgroundColor: NAVY,
            borderRadius: 18,
            padding: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 6,
          }}
        >
          {/* Avatar */}
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: WHITE }}>{initials}</Text>
          </View>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: WHITE }}>{user?.name ?? '—'}</Text>
            <Text style={{ fontSize: 12, color: '#85B7EB', marginTop: 2 }}>{user?.phone ?? user?.email ?? ''}</Text>
            {business ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                <View style={{ backgroundColor: addOpacity(planColor, '30'), borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: planColor }}>{business.plan}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#6BA3D0' }}>{business.name}</Text>
              </View>
            ) : null}
          </View>

          <ChevronRight size={18} color='#6BA3D0' />
        </TouchableOpacity>

        {/* ── Business section ─────────────────────────────────────────────── */}
        <SectionLabel label="Mon activité" />
        <Card>
          <MenuRow icon={Wallet}   label="Dépenses"  sub="Toutes vos sorties de caisse" color={AMBER}   onPress={() => router.push('/(tabs)/expenses' as never)} />
          <Divider />
          <MenuRow icon={BarChart2} label="Rapports"  sub="Ventes, marges et tendances"  color={'#8B5CF6'} onPress={() => router.push('/(tabs)/reports' as never)} />
          <Divider />
          <MenuRow icon={Building2} label="Ma boutique" sub="Paramètres de l'entreprise" color={GREEN}   onPress={() => router.push('/(tabs)/profile' as never)} />
        </Card>

        {/* ── App section ──────────────────────────────────────────────────── */}
        <SectionLabel label="Application" />
        <Card>
          <MenuRow icon={Settings}  label="Paramètres" sub="Langue, notifications, thème" color={MUTED}  onPress={() => {}} />
          <Divider />
          <MenuRow icon={Shield}    label="Confidentialité" sub="Données et permissions"  color={BLUE}   onPress={() => {}} />
          <Divider />
          <MenuRow icon={HelpCircle} label="Aide & support" sub="FAQ et contact"          color={'#0891B2'} onPress={() => {}} />
        </Card>

        {/* ── Logout ───────────────────────────────────────────────────────── */}
        <SectionLabel label="Compte" />
        <Card>
          <MenuRow icon={LogOut} label="Se déconnecter" color="#E24B4A" danger onPress={handleLogout} />
        </Card>

      </ScrollView>
    </SafeAreaView>
  )
}
