import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ locale }) => {
  const activeLocale: string = routing.locales.includes(locale as typeof routing.locales[number])
    ? (locale as string)
    : routing.defaultLocale

  return {
    locale: activeLocale,
    messages: (await import(`../messages/${activeLocale}.json`)).default,
  }
})
