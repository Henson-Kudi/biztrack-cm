// React Native ThemeProvider — used in apps/mobile
// Web and desktop use CSS variables via tailwind.config.ts

import React, { createContext, useContext } from 'react'
import { light, dark, colors, type Theme } from './tokens'

interface ThemeContextValue {
  theme: Theme
  colors: typeof colors
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: light,
  colors,
  isDark: false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // React Native's useColorScheme will be imported by the consuming app
  // This avoids a hard dependency on react-native in the package
  let isDark = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useColorScheme } = require('react-native')
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const scheme = useColorScheme()
    isDark = scheme === 'dark'
  } catch {
    // Not in React Native environment
  }

  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
