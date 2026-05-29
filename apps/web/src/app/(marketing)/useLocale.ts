'use client'
import { useState, useCallback, useEffect } from 'react'
import type { Locale, TranslationKey } from './translations'
import { translations } from './translations'

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    const stored = localStorage.getItem('mkt-locale') as Locale | null
    if (stored === 'fr' || stored === 'en') setLocaleState(stored)
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('mkt-locale', l)
  }, [])

  const t = useCallback(
    (key: TranslationKey): string =>
      (translations[locale][key] as string) ?? (translations['fr'][key] as string),
    [locale],
  )

  return { locale, setLocale, t }
}
