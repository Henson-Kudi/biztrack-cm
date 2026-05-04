import { Stack } from 'expo-router'

/** Auth group layout — no navbar, no header. All auth screens are full-screen. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#042C53' },
      }}
    />
  )
}
