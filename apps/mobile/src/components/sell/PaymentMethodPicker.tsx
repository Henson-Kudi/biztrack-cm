import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Banknote, Smartphone, CreditCard } from 'lucide-react-native'
import type { PaymentMethod } from '@/store/cart.store'
import theme from '../../../theme'

const { colors, radius } = theme

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'CASH',         label: 'Espèces' },
  { key: 'MOBILE_MONEY', label: 'Mobile Money' },
  { key: 'CARD',         label: 'Carte' },
]

interface PaymentMethodPickerProps {
  selected: PaymentMethod
  onSelect: (method: PaymentMethod) => void
}

export function PaymentMethodPicker({ selected, onSelect }: PaymentMethodPickerProps) {
  return (
    <View style={styles.container}>
      {METHODS.map(({ key, label }) => {
        const isActive = selected === key
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onSelect(key)}
            activeOpacity={0.75}
            style={[styles.pill, isActive && styles.pillActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={label}
          >
            {/* Clone icon with correct color */}
            <View style={{ opacity: isActive ? 1 : 0.45 }}>
              {/* Re-render icon with color */}
              {key === 'CASH'         && <Banknote   size={15} color={isActive ? colors.primary : colors.neutral[800]} strokeWidth={1.8} />}
              {key === 'MOBILE_MONEY' && <Smartphone size={15} color={isActive ? colors.primary : colors.neutral[800]} strokeWidth={1.8} />}
              {key === 'CARD'         && <CreditCard size={15} color={isActive ? colors.primary : colors.neutral[800]} strokeWidth={1.8} />}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: radius.btn,
    backgroundColor: colors.neutral[50],
    borderWidth: 1.5,
    borderColor: colors.neutral[100],
  },
  pillActive: {
    backgroundColor: colors.brand[50],
    borderColor: colors.primary,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.neutral[800],
  },
  labelActive: {
    color: colors.primary,
  },
})
