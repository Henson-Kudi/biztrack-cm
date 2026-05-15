import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import type { Locale } from './routing'

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolvedLocale = locale ?? (await requestLocale)
  const activeLocale: Locale = routing.locales.includes(resolvedLocale as Locale)
    ? (resolvedLocale as Locale)
    : routing.defaultLocale

  return {
    locale: activeLocale,
    messages: (await import(`../messages/${activeLocale}.json`)).default,
  }
})
