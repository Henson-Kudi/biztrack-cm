import { Tabs } from 'expo-router'
import { View, Text } from 'react-native'
import { Home, ShoppingCart, Package, MoreHorizontal } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TAB_ACTIVE = '#042C53'
const TAB_INACTIVE = '#B0ADA5'
const TAB_BG = '#FFFFFF'

function TabIcon({ icon: Icon, label, focused }: { icon: any; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3, width: 80, paddingTop: 20 }}>
      <Icon size={25} color={focused ? TAB_ACTIVE : TAB_INACTIVE} strokeWidth={focused ? 2.2 : 1.8} />
      <Text style={{ fontSize: 12, color: focused ? TAB_ACTIVE : TAB_INACTIVE, fontWeight: focused ? '600' : '400', textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  )
}

export default function TabLayout() {
  // bottom inset read ONCE here — Expo Router uses tabBarStyle.height to offset
  // all screen content automatically, so no individual screen needs to worry about it.
  const { bottom } = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: TAB_BG,
          borderTopColor: '#E8E6E0',
          borderTopWidth: 1,
          height: 60 + bottom,
          paddingBottom: bottom,
          paddingTop: 0,
          elevation: 12,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: -2 },
          shadowRadius: 8,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={Home} label="Accueil" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={ShoppingCart} label="Vendre" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={Package} label="Produits" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={MoreHorizontal} label="Plus" focused={focused} />,
        }}
      />

      {/* Accessible as routes but not shown in the tab bar */}
      <Tabs.Screen name="profile"   options={{ href: null }} />
      <Tabs.Screen name="expenses"  options={{ href: null }} />
      <Tabs.Screen name="reports"   options={{ href: null }} />
    </Tabs>
  )
}
