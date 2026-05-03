import { View, Text, TouchableOpacity } from 'react-native';
import { ShoppingCart, PackagePlus, BarChart2, ReceiptText, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export function QuickActionGrid() {
  const router = useRouter();

  return (
    <View className="flex-row flex-wrap justify-between gap-y-2 mt-4">
      {/* Nouvelle Vente */}
      <TouchableOpacity 
        className="w-[48%] bg-white rounded-[14px] border border-gray-100 p-3 pt-3.5 relative overflow-hidden"
        onPress={() => router.push('/(tabs)/sell')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Nouvelle Vente"
        accessibilityHint="Encaisser un client"
      >
        <View className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-b-[14px]" />
        <View className="flex-row justify-between items-start mb-2.5">
          <View className="w-9 h-9 rounded-[10px] bg-blue-50 items-center justify-center">
            <ShoppingCart size={18} color="#185FA5" strokeWidth={2} />
          </View>
          <View className="w-[18px] h-[18px] bg-gray-50 rounded-md items-center justify-center">
            <ChevronRight size={12} color="#888780" />
          </View>
        </View>
        <Text className="text-[12px] font-semibold text-gray-800 leading-tight">Nouvelle Vente</Text>
        <Text className="text-[10px] text-gray-400 mt-0.5">Encaisser un client</Text>
      </TouchableOpacity>

      {/* Ajouter Produit */}
      <TouchableOpacity 
        className="w-[48%] bg-white rounded-[14px] border border-gray-100 p-3 pt-3.5 relative overflow-hidden"
        onPress={() => router.push('/(tabs)/products')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Ajouter Produit"
        accessibilityHint="Gérer le stock"
      >
        <View className="absolute bottom-0 left-0 right-0 h-1 bg-green-400 rounded-b-[14px]" />
        <View className="flex-row justify-between items-start mb-2.5">
          <View className="w-9 h-9 rounded-[10px] bg-green-50 items-center justify-center">
            <PackagePlus size={18} color="#639922" strokeWidth={2} />
          </View>
          <View className="w-[18px] h-[18px] bg-gray-50 rounded-md items-center justify-center">
            <ChevronRight size={12} color="#888780" />
          </View>
        </View>
        <Text className="text-[12px] font-semibold text-gray-800 leading-tight">Ajouter Produit</Text>
        <Text className="text-[10px] text-gray-400 mt-0.5">Gérer le stock</Text>
      </TouchableOpacity>

      {/* Rapport du Jour */}
      <TouchableOpacity 
        className="w-[48%] bg-white rounded-[14px] border border-gray-100 p-3 pt-3.5 relative overflow-hidden"
        onPress={() => router.push('/(tabs)/reports')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Rapport du Jour"
        accessibilityHint="Bilan et stats"
      >
        <View className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400 rounded-b-[14px]" />
        <View className="flex-row justify-between items-start mb-2.5">
          <View className="w-9 h-9 rounded-[10px] bg-amber-50 items-center justify-center">
            <BarChart2 size={18} color="#BA7517" strokeWidth={2} />
          </View>
          <View className="w-[18px] h-[18px] bg-gray-50 rounded-md items-center justify-center">
            <ChevronRight size={12} color="#888780" />
          </View>
        </View>
        <Text className="text-[12px] font-semibold text-gray-800 leading-tight">Rapport du Jour</Text>
        <Text className="text-[10px] text-gray-400 mt-0.5">Bilan et stats</Text>
      </TouchableOpacity>

      {/* Enregistrer Dépense */}
      <TouchableOpacity 
        className="w-[48%] bg-white rounded-[14px] border border-gray-100 p-3 pt-3.5 relative overflow-hidden"
        onPress={() => router.push('/(tabs)/expenses')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Enregistrer Dépense"
        accessibilityHint="Charges, achats"
      >
        <View className="absolute bottom-0 left-0 right-0 h-1 bg-red-400 rounded-b-[14px]" />
        <View className="flex-row justify-between items-start mb-2.5">
          <View className="w-9 h-9 rounded-[10px] bg-red-50 items-center justify-center">
            <ReceiptText size={18} color="#E24B4A" strokeWidth={2} />
          </View>
          <View className="w-[18px] h-[18px] bg-gray-50 rounded-md items-center justify-center">
            <ChevronRight size={12} color="#888780" />
          </View>
        </View>
        <Text className="text-[12px] font-semibold text-gray-800 leading-tight">Enregistrer Dépense</Text>
        <Text className="text-[10px] text-gray-400 mt-0.5">Charges, achats</Text>
      </TouchableOpacity>
    </View>
  );
}
