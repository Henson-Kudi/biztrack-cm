import { AppShell } from "@/components/layout/AppShell"
import type { ReactNode } from "react"
import { AuthGate } from "@/components/auth/AuthGate"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  )
}
