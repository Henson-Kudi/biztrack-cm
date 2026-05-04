import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Plus, Package } from 'lucide-react-native'
import { getStockStatus, UNIT_LABELS } from '../products/productHelpers'
import type { Product } from '@/services/products.service'
import theme from '../../../theme'

const { colors, radius } = theme

interface PosProductTileProps {
  product: Product
  onPress: (product: Product) => void
}

export function PosProductTile({ product, onPress }: PosProductTileProps) {
  const stock = getStockStatus(product.stockQuantity, product.lowStockThreshold)
  const unitLabel = UNIT_LABELS[product.unit] ?? product.unit
  const isOut = product.stockQuantity === 0

  return (
    <TouchableOpacity
      onPress={() => !isOut && onPress(product)}
      activeOpacity={isOut ? 1 : 0.75}
      style={[styles.tile, isOut && styles.tileDisabled]}
      accessibilityLabel={`${product.name}, ${(product.price ?? 0).toLocaleString('fr-FR')} XAF`}
      accessibilityState={{ disabled: isOut }}
    >
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: isOut ? colors.neutral[50] : colors.brand[50] }]}>
        <Package size={22} color={isOut ? colors.neutral[100] : colors.brand[600]} strokeWidth={1.5} />
      </View>

      {/* Name */}
      <Text style={[styles.name, isOut && styles.textDimmed]} numberOfLines={2}>
        {product.name}
      </Text>

      {/* Price */}
      <Text style={[styles.price, isOut && styles.textDimmed]}>
        {(product.price ?? 0).toLocaleString('fr-FR')}
        <Text style={styles.currency}> XAF</Text>
      </Text>

      {/* Stock badge */}
      <View style={[styles.stockBadge, { backgroundColor: stock.bg }]}>
        <Text style={[styles.stockText, { color: stock.color }]}>
          {isOut ? 'Rupture' : `${product.stockQuantity} ${unitLabel}`}
        </Text>
      </View>

      {/* Add button — hidden when out of stock */}
      {!isOut && (
        <View style={styles.addBtn}>
          <Plus size={14} color={colors.neutral[50]} strokeWidth={2.5} />
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: radius.card,
    padding: 10,
    margin: 4,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    alignItems: 'center',
    minHeight: 140,
  },
  tileDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.neutral[800],
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 16,
  },
  price: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brand[800],
    marginBottom: 5,
  },
  currency: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.neutral[400],
  },
  stockBadge: {
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 6,
  },
  stockText: {
    fontSize: 10,
    fontWeight: '600',
  },
  addBtn: {
    width: 26,
    height: 26,
    borderRadius: 99,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  textDimmed: {
    color: colors.neutral[400],
  },
})
