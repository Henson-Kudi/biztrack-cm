'use client'

import { useMessages } from 'next-intl'
import { useTheme } from 'next-themes'
import type { SyncSettings } from '@biztrack/types'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@biztrack/ui'
import { cn } from '@/lib/utils'
import { useSyncSnapshot } from '@/hooks/useSyncSnapshot'
import { hasDesktopIpc } from '@/services/ipc.bridge'

const syncQualityOptions: SyncSettings['minQuality'][] = ['fair', 'strong', 'very_strong']

export function TopBar() {
  const messages = useMessages()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false)
  const { snapshot, trigger, updateSettings } = useSyncSnapshot()
  const syncMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isSyncMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!syncMenuRef.current?.contains(event.target as Node)) {
        setIsSyncMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSyncMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSyncMenuOpen])

  const isDark = resolvedTheme === 'dark'
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')
  const isDesktopRuntime = hasDesktopIpc()
  const topbarMessages =
    messages && typeof messages === 'object' && 'topbar' in messages
      ? (messages.topbar as Record<string, unknown>)
      : null
  const lookupMessage = (key: string) => {
    const segments = key.split('.')
    let current: unknown = topbarMessages

    for (const segment of segments) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        return null
      }
      current = (current as Record<string, unknown>)[segment]
    }

    return typeof current === 'string' ? current : null
  }
  const tr = (key: string, fallback: string) => lookupMessage(key) ?? fallback
  const lastSyncLabel = snapshot.lastSyncedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(snapshot.lastSyncedAt))
    : tr('never', 'Never')
  const qualityLabel = tr(`quality.${snapshot.network.quality}`, snapshot.network.quality)
  const statusLabel = tr(`status.${snapshot.status}`, snapshot.status)
  const minQualityLabel = tr(
    `quality.${snapshot.settings.minQuality}`,
    snapshot.settings.minQuality,
  )
  const realtimeModeLabel = tr(
    `realtime.mode.${snapshot.realtime.mode}`,
    snapshot.realtime.mode,
  )
  const realtimeStatusLabel = tr(
    `realtime.status.${snapshot.realtime.status}`,
    snapshot.realtime.status,
  )
  const autoSyncWarning = tr(
    'auto_sync_warning',
    'Auto-sync is off on this device. If you use more than one device, recent changes may not stay up to date until you sync manually.',
  )

  return (
    <header className="flex h-[52px] items-center justify-between border-b border-border bg-card px-6">
      <div className="min-w-0">
        {isDesktopRuntime ? (
          <>
            <div className="text-xs text-muted-foreground">
              {tr('last_sync', 'Last sync: {time}').replace('{time}', lastSyncLabel)}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {tr('quality_label', 'Connection: {quality}').replace('{quality}', qualityLabel)}
              </span>
              <span>|</span>
              <span>{tr('status_label', 'Sync: {status}').replace('{status}', statusLabel)}</span>
              <span>|</span>
              <span>
                {tr('pending_label', 'Pending: {count}').replace(
                  '{count}',
                  String(snapshot.pendingCount),
                )}
              </span>
              <span>|</span>
              <span>
                {tr('realtime_label', 'Transport: {mode} ({status})')
                  .replace('{mode}', realtimeModeLabel)
                  .replace('{status}', realtimeStatusLabel)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              {tr('desktop_only_title', 'Desktop app')}
            </div>
            <div className="text-xs text-muted-foreground">
              {tr(
                'desktop_only_subtitle',
                'Sync preferences are available in the installed desktop app.',
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isDesktopRuntime ? (
          <div ref={syncMenuRef} className="relative">
            <div className="group relative">
              <button
                type="button"
                onClick={() => setIsSyncMenuOpen((current) => !current)}
                aria-expanded={isSyncMenuOpen}
                aria-haspopup="dialog"
                className={cn(
                  'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors',
                  snapshot.settings.autoSyncEnabled
                    ? 'border-border text-foreground hover:bg-accent hover:text-accent-foreground'
                    : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
                )}
              >
                <span>
                  {snapshot.settings.autoSyncEnabled
                    ? tr('auto_sync_on', 'Auto-sync on')
                    : tr('auto_sync_off', 'Auto-sync off')}
                </span>
                {!snapshot.settings.autoSyncEnabled ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-semibold text-white">
                    !
                  </span>
                ) : null}
                <svg
                  viewBox="0 0 20 20"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={cn('transition-transform', isSyncMenuOpen ? 'rotate-180' : '')}
                >
                  <path d="m5 7 5 5 5-5" />
                </svg>
              </button>

              {snapshot.settings.autoSyncEnabled ? (
                <div
                  className={cn(
                    'pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-20 hidden rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] shadow-sm group-hover:flex group-focus-within:flex',
                    snapshot.realtime.mode === 'realtime'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : snapshot.realtime.mode === 'fallback'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {tr('realtime_badge', 'Live channel')}: {realtimeModeLabel}
                </div>
              ) : null}

              {!snapshot.settings.autoSyncEnabled && !isSyncMenuOpen ? (
                <div className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-20 hidden w-80 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-900 shadow-lg group-hover:block group-focus-within:block">
                  {autoSyncWarning}
                </div>
              ) : null}
            </div>

            {isSyncMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-80 rounded-2xl border border-border bg-card p-4 shadow-xl">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-card-foreground">
                    {tr('settings_title', 'Sync preferences')}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {tr(
                      'settings_description',
                      'These preferences are stored only on this device.',
                    )}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {tr('realtime_status_label', 'Live channel: {mode} ({status})')
                      .replace('{mode}', realtimeModeLabel)
                      .replace('{status}', realtimeStatusLabel)}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-border bg-background px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {tr('auto_sync_label', 'Auto-sync')}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {snapshot.settings.autoSyncEnabled
                            ? tr(
                                'auto_sync_help_on',
                                'BizTrack will sync in the background when your connection is good enough.',
                              )
                            : tr(
                                'auto_sync_help_off',
                                'Changes stay local until you sync manually or turn auto-sync back on.',
                              )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void updateSettings({
                            autoSyncEnabled: !snapshot.settings.autoSyncEnabled,
                          })
                        }
                        className={cn(
                          'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                          snapshot.settings.autoSyncEnabled
                            ? 'bg-foreground text-background hover:opacity-90'
                            : 'bg-amber-600 text-white hover:bg-amber-700',
                        )}
                      >
                        {snapshot.settings.autoSyncEnabled
                          ? tr('auto_sync_disable', 'Turn off')
                          : tr('auto_sync_enable', 'Turn on')}
                      </button>
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {tr('min_quality_label', 'Start auto-sync when connection is')}
                    </span>
                    <select
                      value={snapshot.settings.minQuality}
                      onChange={(event) =>
                        void updateSettings({
                          minQuality: event.target.value as SyncSettings['minQuality'],
                        })
                      }
                      disabled={!snapshot.settings.autoSyncEnabled}
                      className="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {syncQualityOptions.map((quality) => (
                        <option key={quality} value={quality}>
                          {tr(`quality.${quality}`, quality)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <p className="text-xs leading-5 text-muted-foreground">
                    {snapshot.settings.autoSyncEnabled
                      ? tr(
                          'min_quality_help',
                          'Background sync starts once this device reaches {quality} connection quality.',
                        ).replace('{quality}', minQualityLabel)
                      : tr(
                          'min_quality_disabled',
                          'Turn auto-sync back on to choose when background sync starts.',
                        )}
                  </p>

                  {!snapshot.settings.autoSyncEnabled ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                      {autoSyncWarning}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {isDesktopRuntime ? (
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3 text-xs"
            onClick={() => void trigger()}
            disabled={snapshot.status === 'syncing'}
          >
            {snapshot.status === 'syncing'
              ? tr('syncing', 'Syncing...')
              : tr('sync_now', 'Sync now')}
          </Button>
        ) : null}
        {mounted && (
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              isDark
                ? tr('theme_to_light', 'Switch to light mode')
                : tr('theme_to_dark', 'Switch to dark mode')
            }
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {isDark ? (
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
                <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
                <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            )}
          </button>
        )}
        <div className="text-sm text-foreground">{tr('user_fallback', 'Team member')}</div>
      </div>
    </header>
  )
}
