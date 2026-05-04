import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Minus, Plus, X } from 'lucide-react-native'
import type { CartItem } from '@/store/cart.store'
import { UNIT_LABELS } from '../products/productHelpers'
import theme from '../../../theme'

const { colors, radius } = theme

interface CartItemRowProps {
  item: CartItem
  onIncrement: () => void
  onDecrement: () => void
  onRemove: () => void
}

export function CartItemRow({ item, onIncrement, onDecrement, onRemove }: CartItemRowProps) {
  const { product, quantity } = item
  const unitLabel = UNIT_LABELS[product.unit] ?? product.unit
  const lineTotal = product.price * quantity

  return (
    <View style={styles.row}>
      {/* Name + unit */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.unitPrice}>
          {product.price.toLocaleString('fr-FR')} XAF / {unitLabel}
        </Text>
      </View>

      {/* Quantity stepper */}
      <View style={styles.stepper}>
        <TouchableOpacity
          onPress={onDecrement}
          hitSlop={8}
          style={[styles.stepBtn, { backgroundColor: quantity <= 1 ? colors.neutral[50] : colors.danger[50] }]}
          accessibilityLabel={quantity <= 1 ? "Supprimer l'article" : 'Diminuer la quantité'}
        >
          {quantity <= 1
            ? <X size={12} color={colors.danger[400]} strokeWidth={2.5} />
            : <Minus size={12} color={colors.danger[400]} strokeWidth={2.5} />
          }
        </TouchableOpacity>

        <Text style={styles.qty}>{quantity}</Text>

        <TouchableOpacity
          onPress={onIncrement}
          hitSlop={8}
          style={[styles.stepBtn, { backgroundColor: colors.brand[50] }]}
          accessibilityLabel="Augmenter la quantité"
        >
          <Plus size={12} color={colors.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Line total */}
      <Text style={styles.total}>
        {lineTotal.toLocaleString('fr-FR')}
      </Text>

      {/* Remove */}
      <TouchableOpacity onPress={onRemove} hitSlop={8} accessibilityLabel="Supprimer">
        <X size={14} color={colors.neutral[400]} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[50],
    gap: 8,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.neutral[800],
    marginBottom: 2,
  },
  unitPrice: {
    fontSize: 11,
    color: colors.neutral[400],
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.neutral[800],
    minWidth: 20,
    textAlign: 'center',
  },
  total: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brand[800],
    minWidth: 60,
    textAlign: 'right',
  },
})
