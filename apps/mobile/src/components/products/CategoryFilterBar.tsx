import { ScrollView, TouchableOpacity, Text } from 'react-native'
import type { ProductCategory } from '@/services/products.service'

interface CategoryFilterBarProps {
  categories: ProductCategory[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function CategoryFilterBar({ categories, selectedId, onSelect }: CategoryFilterBarProps) {
  if (categories.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
    >
      {/* "All" pill */}
      <TouchableOpacity
        onPress={() => onSelect(null)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Toutes les catégories"
        accessibilityState={{ selected: selectedId === null }}
        className="rounded-full px-4 py-1.5 border"
        style={
          selectedId === null
            ? { backgroundColor: '#185FA5', borderColor: '#185FA5' }
            : { backgroundColor: '#fff', borderColor: '#D3D1C7' }
        }
      >
        <Text
          className="text-[12px] font-semibold"
          style={{ color: selectedId === null ? '#fff' : '#444441' }}
        >
          Tous
        </Text>
      </TouchableOpacity>

      {categories.map((cat) => {
        const isActive = selectedId === cat.id
        return (
          <TouchableOpacity
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={cat.name}
            accessibilityState={{ selected: isActive }}
            className="rounded-full px-4 py-1.5 border"
            style={
              isActive
                ? { backgroundColor: '#185FA5', borderColor: '#185FA5' }
                : { backgroundColor: '#fff', borderColor: '#D3D1C7' }
            }
          >
            <Text
              className="text-[12px] font-semibold"
              style={{ color: isActive ? '#fff' : '#444441' }}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}
