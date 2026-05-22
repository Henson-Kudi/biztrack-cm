import { View, Text, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ShoppingCart } from 'lucide-react-native'
import { Colors, addOpacity } from '../../utils/colors'

const { NAVY, BLUE, CREAM, WHITE, MUTED } = Colors

export default function SellScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      {/* Header */}
      <View style={{
        backgroundColor: NAVY,
        paddingTop: insets.top + 12,
        paddingBottom: 20,
        paddingHorizontal: 20,
      }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: WHITE }}>Nouvelle vente</Text>
        <Text style={{ fontSize: 12, color: '#85B7EB', marginTop: 2 }}>Point de vente</Text>
      </View>

      {/* Coming soon body */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <View
          style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: addOpacity(BLUE, '15'), alignItems: 'center', justifyContent: 'center' }}
          accessible
          accessibilityLabel="Icône de caisse enregistreuse"
        >
          <ShoppingCart size={34} color={BLUE} strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: '700', color: NAVY, textAlign: 'center' }}>
          Caisse enregistreuse
        </Text>
        <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20 }}>
          Le module POS tap-to-sell arrive bientôt. Vous pourrez enregistrer des ventes en quelques secondes.
        </Text>
        <TouchableOpacity
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Bientôt disponible"
          accessibilityHint="Cette fonctionnalité sera disponible prochainement"
          style={{
            marginTop: 8,
            backgroundColor: NAVY,
            borderRadius: 12,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: WHITE }}>Bientôt disponible</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
