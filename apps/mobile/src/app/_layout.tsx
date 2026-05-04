import 'react-native-gesture-handler'
import { useEffect } from 'react'
import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '../store/useAuthStore'
import '../../global.css'

// Keep splash screen open until hydration finishes to prevent a flash of unauthenticated content
SplashScreen.preventAutoHideAsync().catch(() => {
  // Catch errors if called after mount
})

export default function RootLayout() {
  const router = useRouter()
  const segments = useSegments()
  const { accessToken, business, user, _hasHydrated, setHasHydrated } = useAuthStore()

  // Safety net: if AsyncStorage rehydration callback silently fails (common on
  // some Android/Expo versions), force _hasHydrated after 2s so we never
  // get a permanent black screen.
  useEffect(() => {
    if (_hasHydrated) return
    const timer = setTimeout(() => {
      setHasHydrated(true)
    }, 2000)
    return () => clearTimeout(timer)
  }, [_hasHydrated, setHasHydrated])

  // Auth guard: unauthenticated users → (auth), authenticated users → (tabs)
  useEffect(() => {
    if (!_hasHydrated) return

    // Hide splash screen once we know the auth state
    SplashScreen.hideAsync().catch(() => {})

    const inAuthGroup = segments[0] === '(auth)'

    // Only considered "fully authenticated" when onboarding is complete.
    // Users who have tokens + business but are still in onboarding steps
    // (e.g. ADD_FIRST_PRODUCT) must NOT be redirected to (tabs) early —
    // that's what caused the infinite reload loop.
    const isFullyAuthenticated = Boolean(
      accessToken && business && user?.onboardingStep === 'COMPLETE'
    )

    if (!isFullyAuthenticated && !inAuthGroup) {
      router.replace('/(auth)')
    } else if (isFullyAuthenticated && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [accessToken, business, user, segments, router, _hasHydrated])

  if (!_hasHydrated) {
    // Avoid rendering the stack before state is hydrated to prevent flashes.
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
