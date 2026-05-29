'use client'

import { BusinessMemberRole } from '@biztrack/types'
import { useAuthStore } from '@/stores/auth.store'
import { AccountantDashboard } from './_components/AccountantDashboard'
import { CashierDashboard } from './_components/CashierDashboard'
import { ManagerDashboard } from './_components/ManagerDashboard'

export default function DashboardPage() {
  const role = useAuthStore((state) => state.role)

  if (role === BusinessMemberRole.CASHIER || role === BusinessMemberRole.STAFF) {
    return <CashierDashboard />
  }

  if (role === BusinessMemberRole.ACCOUNTANT) {
    return <AccountantDashboard />
  }

  return <ManagerDashboard />
}
