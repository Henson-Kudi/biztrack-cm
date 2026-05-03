import React, { createContext, useContext } from 'react'
import { useColorScheme } from 'react-native'
import { colors, dark, light, type Theme } from './tokens'

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
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'

  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
