import { AppShell } from "@/components/layout/AppShell"
import type { ReactNode } from "react"
import { AuthGate } from "@/components/auth/AuthGate"
import { routing } from "@/i18n/routing"

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export const dynamicParams = false

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  )
}
