import { View, Text, TouchableOpacity } from 'react-native'
import { PackagePlus, Search } from 'lucide-react-native'

interface EmptyProductStateProps {
  isFiltered: boolean
  onAddPress: () => void
}

export function EmptyProductState({ isFiltered, onAddPress }: EmptyProductStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      {/* Icon container */}
      <View
        className="w-20 h-20 rounded-2xl items-center justify-center mb-5"
        style={{ backgroundColor: '#E6F1FB' }}
      >
        {isFiltered ? (
          <Search size={34} color="#185FA5" strokeWidth={1.5} />
        ) : (
          <PackagePlus size={34} color="#185FA5" strokeWidth={1.5} />
        )}
      </View>

      <Text className="text-[17px] font-bold text-gray-800 mb-2 text-center">
        {isFiltered ? 'Aucun résultat' : 'Aucun produit'}
      </Text>

      <Text className="text-[13px] text-center leading-5 mb-7" style={{ color: '#888780' }}>
        {isFiltered
          ? 'Essayez de modifier votre recherche ou de changer de catégorie.'
          : 'Commencez par ajouter votre premier produit pour pouvoir vendre.'}
      </Text>

      {!isFiltered && (
        <TouchableOpacity
          onPress={onAddPress}
          activeOpacity={0.85}
          className="rounded-xl px-7 py-3"
          style={{ backgroundColor: '#185FA5' }}
          accessibilityRole="button"
          accessibilityLabel="Ajouter un produit"
        >
          <Text className="text-white font-semibold text-[14px]">+ Ajouter un produit</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
