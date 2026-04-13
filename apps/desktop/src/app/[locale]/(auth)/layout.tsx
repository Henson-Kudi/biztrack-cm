import { AuthRedirect } from '@/components/auth/AuthRedirect'
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthRedirect>{children}</AuthRedirect>
}
