'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import type { SyncSettings } from '@biztrack/types'
import { Link, usePathname } from '@/i18n/navigation'
import { type Locale, routing } from '@/i18n/routing'
import { useSyncSnapshot } from '@/hooks/useSyncSnapshot'
import { cn } from '@/lib/utils'
import { hasDesktopIpc } from '@/services/ipc.bridge'

const syncQualityOptions: SyncSettings['minQuality'][] = ['fair', 'strong', 'very_strong']

export function TopBar() {
  const t = useTranslations('topbar')
  const locale = useLocale()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false)
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false)
  const { snapshot, trigger, updateSettings } = useSyncSnapshot()
  const syncMenuRef = useRef<HTMLDivElement | null>(null)
  const localeMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isSyncMenuOpen && !isLocaleMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const insideSyncMenu = syncMenuRef.current?.contains(target)
      const insideLocaleMenu = localeMenuRef.current?.contains(target)

      if (!insideSyncMenu && !insideLocaleMenu) {
        setIsSyncMenuOpen(false)
        setIsLocaleMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSyncMenuOpen(false)
        setIsLocaleMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isLocaleMenuOpen, isSyncMenuOpen])

  const isDark = resolvedTheme === 'dark'
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')
  const isDesktopRuntime = hasDesktopIpc()
  const currentLocale: Locale = locale.startsWith('fr') ? 'fr' : 'en'

  const qualityLabels = {
    offline: t('quality.offline'),
    weak: t('quality.weak'),
    fair: t('quality.fair'),
    strong: t('quality.strong'),
    very_strong: t('quality.very_strong'),
  } as const

  const statusLabels = {
    idle: t('status.idle'),
    syncing: t('status.syncing'),
    synced: t('status.synced'),
    error: t('status.error'),
    paused: t('status.paused'),
    disabled: t('status.disabled'),
  } as const

  const realtimeModeLabels = {
    disabled: t('realtime.mode.disabled'),
    fallback: t('realtime.mode.fallback'),
    realtime: t('realtime.mode.realtime'),
  } as const

  const realtimeStatusLabels = {
    disconnected: t('realtime.status.disconnected'),
    connecting: t('realtime.status.connecting'),
    connected: t('realtime.status.connected'),
    reconnecting: t('realtime.status.reconnecting'),
  } as const

  const qualityLabel = qualityLabels[snapshot.network.quality]
  const statusLabel = statusLabels[snapshot.status]
  const minQualityLabel = qualityLabels[snapshot.settings.minQuality]
  const realtimeModeLabel = realtimeModeLabels[snapshot.realtime.mode]
  const realtimeStatusLabel = realtimeStatusLabels[snapshot.realtime.status]
  const lastSyncLabel = snapshot.lastSyncedAt
    ? new Intl.DateTimeFormat(currentLocale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(snapshot.lastSyncedAt))
    : t('never')
  const autoSyncWarning = t('auto_sync_warning')
  const localeLabels: Record<Locale, string> = {
    en: t('languages.en'),
    fr: t('languages.fr'),
  }

  const statusToneClassName =
    snapshot.status === 'synced'
      ? 'bg-[#E4F3E6] text-[#3B6D11]'
      : snapshot.status === 'syncing'
        ? 'bg-[#E6F1FB] text-[#185FA5]'
        : snapshot.status === 'error'
          ? 'bg-[#FCEBEB] text-[#A32D2D]'
          : snapshot.status === 'paused'
            ? 'bg-[#FAEEDA] text-[#854F0B]'
            : 'bg-white/10 text-white/85'

  return (
    <header className="flex min-h-[68px] flex-wrap items-center gap-3 border-b border-black/15 bg-[#042C53] px-4 py-3 text-white">
      <div className="flex min-w-[220px] items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#185FA5] text-sm font-bold">
          BT
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">BizTrack CM</div>
          <div className="truncate text-xs text-[#85B7EB]">
            {isDesktopRuntime ? t('last_sync', { time: lastSyncLabel }) : t('desktop_only_subtitle')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isDesktopRuntime ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-white/85">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  snapshot.network.online ? 'bg-[#97C459]' : 'bg-[#FAC775]',
                )}
              />
              {t('quality_label', { quality: qualityLabel })}
            </span>
            <span className={cn('inline-flex rounded-full px-3 py-1.5 font-medium', statusToneClassName)}>
              {t('status_label', { status: statusLabel })}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-white/85">
            {t('desktop_only_title')}
          </span>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {isDesktopRuntime ? (
          <div ref={syncMenuRef} className="relative">
            <div className="group relative">
              <button
                type="button"
                onClick={() => {
                  setIsSyncMenuOpen((current) => !current)
                  setIsLocaleMenuOpen(false)
                }}
                aria-expanded={isSyncMenuOpen}
                aria-haspopup="dialog"
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition',
                  snapshot.settings.autoSyncEnabled
                    ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                    : 'border-[#FAC775]/40 bg-[#FAEEDA] text-[#854F0B] hover:bg-[#FCE6BC]',
                )}
              >
                <span>
                  {snapshot.settings.autoSyncEnabled ? t('auto_sync_on') : t('auto_sync_off')}
                </span>
                {!snapshot.settings.autoSyncEnabled ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#A32D2D] px-1 text-[10px] font-semibold text-white">
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
                  {t('realtime_badge')}: {realtimeModeLabel}
                </div>
              ) : null}

              {!snapshot.settings.autoSyncEnabled && !isSyncMenuOpen ? (
                <div className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-20 hidden w-80 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-900 shadow-lg group-hover:block group-focus-within:block">
                  {autoSyncWarning}
                </div>
              ) : null}
            </div>

            {isSyncMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-80 rounded-2xl border border-border bg-card p-4 shadow-xl">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-card-foreground">{t('settings_title')}</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t('settings_description')}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t('realtime_status_label', {
                      mode: realtimeModeLabel,
                      status: realtimeStatusLabel,
                    })}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-border bg-background px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{t('auto_sync_label')}</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {snapshot.settings.autoSyncEnabled
                            ? t('auto_sync_help_on')
                            : t('auto_sync_help_off')}
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
                          ? t('auto_sync_disable')
                          : t('auto_sync_enable')}
                      </button>
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {t('min_quality_label')}
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
                          {qualityLabels[quality]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <p className="text-xs leading-5 text-muted-foreground">
                    {snapshot.settings.autoSyncEnabled
                      ? t('min_quality_help', { quality: minQualityLabel })
                      : t('min_quality_disabled')}
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
          <button
            type="button"
            onClick={() => void trigger()}
            disabled={snapshot.status === 'syncing'}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={cn(snapshot.status === 'syncing' ? 'animate-spin' : '')}
            >
              <path d="M16 3v4h-4" />
              <path d="M4 17v-4h4" />
              <path d="M15 8A6 6 0 0 0 5 5l-1 2" />
              <path d="M5 12a6 6 0 0 0 10 3l1-2" />
            </svg>
            <span>{snapshot.status === 'syncing' ? t('syncing') : t('sync_now')}</span>
          </button>
        ) : null}

        {mounted ? (
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t('theme_to_light') : t('theme_to_dark')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
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
        ) : null}

        <div ref={localeMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setIsLocaleMenuOpen((current) => !current)
              setIsSyncMenuOpen(false)
            }}
            aria-expanded={isLocaleMenuOpen}
            aria-haspopup="menu"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="6.5" />
              <path d="M3.5 10h13" />
              <path d="M10 3.5a10.5 10.5 0 0 1 0 13" />
              <path d="M10 3.5a10.5 10.5 0 0 0 0 13" />
            </svg>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
              {localeLabels[currentLocale]}
            </span>
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
              className={cn('transition-transform', isLocaleMenuOpen ? 'rotate-180' : '')}
            >
              <path d="m5 7 5 5 5-5" />
            </svg>
          </button>

          {isLocaleMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 min-w-[210px] rounded-2xl border border-border bg-card p-2 shadow-xl">
              {routing.locales.map((language) => {
                const active = currentLocale === language

                return (
                  <Link
                    locale={language}
                    href={pathname.replace(/^\/(en|fr)/, '')}
                    key={language}
                    onClick={() => setIsLocaleMenuOpen(false)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition',
                      active ? 'bg-accent text-primary' : 'text-foreground hover:bg-secondary',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">{localeLabels[language]}</div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {language}
                      </div>
                    </div>
                    {active ? (
                      <svg
                        viewBox="0 0 20 20"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m4.5 10 3.5 3.5 7-7" />
                      </svg>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
