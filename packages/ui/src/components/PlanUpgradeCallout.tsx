'use client'

import * as React from 'react'
import type { SubscriptionPlan } from '@biztrack/types'
import { cn } from '../lib/utils'
import { buttonVariants } from './Button'

type PlanUpgradeCalloutProps = {
  title: string
  description: string
  upgradeLabel: string
  upgradeHref: string
  requiredPlan?: SubscriptionPlan | null
  className?: string
}

export function PlanUpgradeCallout({
  title,
  description,
  upgradeLabel,
  upgradeHref,
  requiredPlan = null,
  className,
}: PlanUpgradeCalloutProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-amber-950 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            {requiredPlan ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900">
                {requiredPlan}+
              </span>
            ) : null}
          </div>

          <p className="text-sm leading-6 text-amber-900/85">{description}</p>

          <a
            href={upgradeHref}
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }))}
          >
            {upgradeLabel}
          </a>
        </div>
      </div>
    </div>
  )
}
