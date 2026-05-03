import { AuthRedirect } from '@/components/auth/AuthRedirect'
import type { ReactNode } from 'react'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export const dynamicParams = false

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthRedirect>{children}</AuthRedirect>
}
