import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { Package, AlertTriangle, Edit2, Trash2 } from 'lucide-react-native'
import type { Product } from '@/services/products.service'
import { getStockStatus, UNIT_LABELS } from './productHelpers'

// ─── Component ────────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export function ProductCard({ product, onEdit, onDelete }: ProductCardProps) {
  const stock = getStockStatus(product.stockQuantity, product.lowStockThreshold)
  const unitLabel = UNIT_LABELS[product.unit] ?? product.unit
  const isLow = product.stockQuantity <= product.lowStockThreshold

  const handleDelete = () => {
    Alert.alert(
      'Supprimer le produit',
      `Voulez-vous vraiment supprimer "${product.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => onDelete(product.id),
        },
      ],
    )
  }

  return (
    <View className="bg-white rounded-xl border border-gray-100 mb-3 overflow-hidden"
      style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
    >
      <View className="flex-row items-center px-4 py-3 gap-3">

        {/* Product Icon */}
        <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: '#E6F1FB' }}>
          <Package size={20} color="#185FA5" strokeWidth={1.5} />
        </View>

        {/* Name + Category */}
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold text-gray-800 mb-0.5" numberOfLines={1}>
            {product.name}
          </Text>
          <View className="flex-row items-center gap-2 flex-wrap">
            {product.category && (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#E6F1FB' }}>
                <Text className="text-[10px] font-semibold" style={{ color: '#185FA5' }}>
                  {product.category.name}
                </Text>
              </View>
            )}
            {product.sku ? (
              <Text className="text-[10px] text-gray-400">#{product.sku}</Text>
            ) : null}
          </View>
        </View>

        {/* Price + Stock */}
        <View className="items-end gap-1.5">
          <Text className="text-[14px] font-bold" style={{ color: '#0C447C' }}>
            {product.price.toLocaleString('fr-FR')}{' '}
            <Text className="text-[10px] font-normal" style={{ color: '#888780' }}>XAF</Text>
          </Text>
          <View
            className="flex-row items-center rounded-full px-2 py-0.5 gap-0.5"
            style={{ backgroundColor: stock.bg }}
          >
            {isLow && <AlertTriangle size={9} color={stock.color} />}
            <Text className="text-[10px] font-semibold" style={{ color: stock.color }}>
              {product.stockQuantity} {unitLabel}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View className="flex-col gap-2 pl-1">
          <TouchableOpacity
            onPress={() => onEdit(product)}
            hitSlop={8}
            className="w-7 h-7 rounded-lg items-center justify-center"
            style={{ backgroundColor: '#E6F1FB' }}
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${product.name}`}
          >
            <Edit2 size={13} color="#185FA5" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            hitSlop={8}
            className="w-7 h-7 rounded-lg items-center justify-center"
            style={{ backgroundColor: '#FCEBEB' }}
            accessibilityRole="button"
            accessibilityLabel={`Supprimer ${product.name}`}
          >
            <Trash2 size={13} color="#E24B4A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Low stock warning bar */}
      {isLow && (
        <View
          className="px-4 py-1.5 flex-row items-center gap-1.5"
          style={{ backgroundColor: product.stockQuantity === 0 ? '#FCEBEB' : '#FAEEDA' }}
        >
          <AlertTriangle size={10} color={stock.color} />
          <Text className="text-[10px] font-medium" style={{ color: stock.color }}>
            {product.stockQuantity === 0
              ? 'Produit en rupture de stock'
              : `Seuil d'alerte atteint (min: ${product.lowStockThreshold} ${unitLabel})`}
          </Text>
        </View>
      )}
    </View>
  )
}
