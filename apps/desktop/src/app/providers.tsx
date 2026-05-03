'use client'

import { ThemeProvider, useTheme } from 'next-themes'
import { useEffect } from 'react'
import { ipc } from '@/services/ipc.bridge'

function ThemeBridge() {
  const { setTheme } = useTheme()

  useEffect(() => {
    return ipc.theme?.onThemeChange?.((theme) => {
      if (theme === 'light' || theme === 'dark' || theme === 'system') {
        setTheme(theme)
      }
    })
  }, [setTheme])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeBridge />
      {children}
    </ThemeProvider>
  )
}
