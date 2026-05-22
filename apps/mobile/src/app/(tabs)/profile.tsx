import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { User, LogOut, Building2, ChevronRight } from 'lucide-react-native'
import { useAuthStore } from '@/store/useAuthStore'

export default function ProfileScreen() {
  const { user, business, logout } = useAuthStore()

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#F1EFE8' }}>
      {/* Header */}
      <View className="px-4 pt-4 pb-4 border-b border-gray-100" style={{ backgroundColor: '#fff' }}>
        <Text className="text-[22px] font-bold text-gray-900">Profil</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* User card */}
        <View
          className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
        >
          <View className="px-4 py-4 flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: '#E6F1FB' }}>
              <User size={22} color="#185FA5" />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-gray-900">{user?.name ?? '—'}</Text>
              <Text className="text-[12px] mt-0.5" style={{ color: '#888780' }}>{user?.phone}</Text>
              {user?.email ? (
                <Text className="text-[12px]" style={{ color: '#888780' }}>{user.email}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Business card */}
        {business && (
          <View
            className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4"
            style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
          >
            <View className="px-4 py-4 flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: '#EAF3DE' }}>
                <Building2 size={22} color="#639922" />
              </View>
              <View className="flex-1">
                <Text className="text-[13px] font-semibold text-gray-900">{business.name}</Text>
                <Text className="text-[11px] mt-0.5" style={{ color: '#888780' }}>
                  Plan {business.plan} · {business.role}
                </Text>
              </View>
              <ChevronRight size={16} color="#D3D1C7" />
            </View>
          </View>
        )}

        {/* Actions */}
        <View
          className="bg-white rounded-xl border border-gray-100 overflow-hidden"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
        >
          <TouchableOpacity
            onPress={logout}
            activeOpacity={0.7}
            className="flex-row items-center gap-3 px-4 py-4"
          >
            <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: '#FCEBEB' }}>
              <LogOut size={17} color="#E24B4A" />
            </View>
            <Text className="text-[14px] font-semibold" style={{ color: '#E24B4A' }}>
              Se déconnecter
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
