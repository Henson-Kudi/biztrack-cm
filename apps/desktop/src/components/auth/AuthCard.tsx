'use client'

import type { ReactNode } from 'react'

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-sm  p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-primary">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}


