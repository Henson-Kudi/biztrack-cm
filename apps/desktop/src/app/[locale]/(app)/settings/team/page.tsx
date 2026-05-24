'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { BusinessMemberStatus, Resource } from '@biztrack/types'
import type { PendingInviteItem, TeamMember } from '@biztrack/types'
import { Button, Input, PhoneInput } from '@biztrack/ui'
import { Check, Copy, Link2, Loader2, Share2, Users, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelInvite,
  listInvites,
  listTeamMembers,
  removeTeamMember,
  resendInvite,
  sendInvite,
  updateMemberRole,
} from '@/services/auth.api'
import { RoleSelect } from '@/components/team/RoleSelect'
import { getLocalTeamMembers } from '@/services/teams.local'
import { getApiErrorMessage } from '@/services/api-response'
import { decodeJwtPayload } from '@/lib/jwt'
import { getPermissionAccessFromState } from '@/lib/plan-access'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'
import { ipc } from '@/services/ipc.bridge'

type InviteMode = 'phone' | 'email'

function InviteLinkBanner({
  url,
  onDismiss,
}: {
  url: string
  onDismiss: () => void
}) {
  const t = useTranslations('app.team')
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      const message = t('invite_link_whatsapp_message', { url })
      const result = await ipc.share.url({ url, text: message, title: t('invite_link_title') })
      if (result.shared) return
      // Picker unavailable (Linux or share error) — fall back to WhatsApp URL
      const text = encodeURIComponent(message)
      const { installed } = await ipc.app.isWhatsAppInstalled()
      await ipc.app.openExternal(
        installed ? `whatsapp://send?text=${text}` : `https://wa.me/?text=${text}`,
      )
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-800/40">
            <Link2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {t('invite_link_title')}
            </p>
            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {t('invite_link_hint')}
            </p>
            {/* URL row */}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-800/50 dark:bg-emerald-950/40">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                {url}
              </span>
            </div>
            {/* Action buttons */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  copied
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-800/50 dark:text-emerald-300'
                    : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-transparent dark:text-emerald-300 dark:hover:bg-emerald-800/30',
                )}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? t('invite_link_copied') : t('invite_link_copy_tooltip')}
              </button>
              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={sharing}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60 disabled:pointer-events-none dark:border-emerald-700 dark:bg-transparent dark:text-emerald-300 dark:hover:bg-emerald-800/30"
              >
                {sharing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                {t('invite_link_share_tooltip')}
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-800/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function formatLocalDate(isoString: string, locale: string): string {
  return new Date(isoString).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

type RemoveConfirmState = { userId: string; name: string } | null
type RoleEditState = {
  userId: string
  currentRoleId: string
  selectedRoleId: string
} | null

export default function TeamPage() {
  const t = useTranslations('app.team')
  const locale = useLocale()
  const accessToken = useAuthStore((state) => state.accessToken)
  const planState = usePlanStore((state) => state.current)
  const currentUserId = accessToken ? decodeJwtPayload<{ sub: string }>(accessToken)?.sub ?? null : null

  const canInvite = useMemo(
    () => (planState ? getPermissionAccessFromState(planState, Resource.STAFF_INVITE).allowed : false),
    [planState],
  )
  const canManage = useMemo(
    () => (planState ? getPermissionAccessFromState(planState, Resource.STAFF_MANAGE).allowed : false),
    [planState],
  )

  // Online state
  const [isOnline, setIsOnline] = useState(true)
  useEffect(() => {
    ipc.network.isOnline().then(setIsOnline)
    ipc.network.onStatusChange(setIsOnline)
  }, [])

  // Team members: API when online, SQLite fallback when offline
  const [members, setMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    setMembersError(null)
    try {
      if (isOnline) {
        const response = await listTeamMembers()
        setMembers(response.members)
      } else {
        setMembers(await getLocalTeamMembers())
      }
    } catch (err) {
      // On API failure, fall back to local SQLite
      try {
        setMembers(await getLocalTeamMembers())
      } catch {
        setMembersError(getApiErrorMessage(err, t('load_error')))
      }
    } finally {
      setMembersLoading(false)
    }
  }, [isOnline, t])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  // Pending/expired invites (from API — online only)
  const [invites, setInvites] = useState<PendingInviteItem[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [invitesError, setInvitesError] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    if (!isOnline) return
    setInvitesLoading(true)
    setInvitesError(null)
    try {
      const response = await listInvites()
      setInvites(response.invites)
    } catch (err) {
      setInvitesError(getApiErrorMessage(err, t('invites_load_error')))
    } finally {
      setInvitesLoading(false)
    }
  }, [isOnline, t])

  useEffect(() => {
    void loadInvites()
  }, [loadInvites])

  // Invite form
  const [inviteMode, setInviteMode] = useState<InviteMode>('phone')
  const [inviteValue, setInviteValue] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState<string>('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  const handleInvite = async () => {
    const value = inviteValue.trim()
    if (!value || !inviteRoleId) return
    setInviting(true)
    setInviteError(null)
    setInviteLink(null)
    try {
      const payload =
        inviteMode === 'email'
          ? { email: value, roleId: inviteRoleId }
          : { phone: value, roleId: inviteRoleId }
      const result = await sendInvite(payload)
      if (result.status === 'pending_invite' && result.inviteUrl) {
        setInviteLink(result.inviteUrl)
      } else {
        toast(t('invite_success_pending_member'))
      }
      setInviteValue('')
      setInviteRoleId('')
      await Promise.all([loadInvites(), loadMembers()])
    } catch (err) {
      setInviteError(getApiErrorMessage(err, t('invite_error')))
    } finally {
      setInviting(false)
    }
  }

  // Invite actions
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [inviteActionError, setInviteActionError] = useState<string | null>(null)

  const handleResendInvite = async (inviteId: string) => {
    setResendingId(inviteId)
    setInviteActionError(null)
    setInviteLink(null)
    try {
      const result = await resendInvite(inviteId)
      if (result.inviteUrl) {
        setInviteLink(result.inviteUrl)
      }
      await loadInvites()
    } catch (err) {
      setInviteActionError(getApiErrorMessage(err, t('invite_resend_error')))
    } finally {
      setResendingId(null)
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    setCancellingId(inviteId)
    setInviteActionError(null)
    try {
      await cancelInvite(inviteId)
      await loadInvites()
    } catch (err) {
      setInviteActionError(getApiErrorMessage(err, t('invite_cancel_error')))
    } finally {
      setCancellingId(null)
    }
  }

  // Member actions
  const [removeConfirm, setRemoveConfirm] = useState<RemoveConfirmState>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [roleEdit, setRoleEdit] = useState<RoleEditState>(null)
  const [roleChanging, setRoleChanging] = useState(false)
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null)

  const handleRemove = async () => {
    if (!removeConfirm) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await removeTeamMember(removeConfirm.userId)
      setRemoveConfirm(null)
      await loadMembers()
    } catch (err) {
      setRemoveError(getApiErrorMessage(err, t('remove_error')))
    } finally {
      setRemoving(false)
    }
  }

  const handleRoleChange = async () => {
    if (!roleEdit) return
    setRoleChanging(true)
    setRoleChangeError(null)
    try {
      await updateMemberRole(roleEdit.userId, { roleId: roleEdit.selectedRoleId })
      setRoleEdit(null)
      await loadMembers()
    } catch (err) {
      setRoleChangeError(getApiErrorMessage(err, t('change_role_error')))
    } finally {
      setRoleChanging(false)
    }
  }

  const roleLabel = (member: { roleName?: string; role?: string | null }) =>
    member.roleName ?? member.role ?? ''

  const activeMembers = members.filter((m) => m.status !== BusinessMemberStatus.REMOVED)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <Users className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Offline banner */}
      {!isOnline ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          <p className="text-sm text-amber-700 dark:text-amber-400">{t('offline_warning')}</p>
        </div>
      ) : null}

      {/* Plan gate hint */}
      {!canInvite ? (
        <p className="text-sm text-muted-foreground">
          {t.rich('upgrade_hint', {
            link: (chunks) => (
              <a
                href={`/${locale}/subscription`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      ) : null}

      {/* Invite form — always visible, disabled when offline */}
      {canInvite ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t('invite_title')}</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  {inviteMode === 'phone' ? t('invite_phone_label') : t('invite_email_label')}
                </label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none"
                  disabled={!isOnline}
                  onClick={() => {
                    setInviteMode(inviteMode === 'phone' ? 'email' : 'phone')
                    setInviteValue('')
                  }}
                >
                  {inviteMode === 'phone' ? t('invite_use_email') : t('invite_use_phone')}
                </button>
              </div>
              {inviteMode === 'phone' ? (
                <PhoneInput
                  value={inviteValue}
                  onChange={(value: string | undefined) => setInviteValue(value ?? '')}
                  disabled={!isOnline}
                />
              ) : (
                <Input
                  type="email"
                  value={inviteValue}
                  onChange={(e) => setInviteValue(e.target.value)}
                  placeholder={t('invite_email_placeholder')}
                  disabled={!isOnline}
                />
              )}
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('invite_role_label')}
              </label>
              <RoleSelect
                value={inviteRoleId}
                onChange={setInviteRoleId}
                disabled={!isOnline}
                placeholder={t('invite_role_label')}
              />
            </div>
            <Button
              variant="primary"
              onClick={() => void handleInvite()}
              disabled={inviting || !inviteValue.trim() || !isOnline || !inviteRoleId}
            >
              {inviting ? t('invite_sending') : t('invite_action_submit')}
            </Button>
          </div>
          {inviteError ? <p className="mt-2 text-sm text-destructive">{inviteError}</p> : null}
          {inviteLink ? (
            <InviteLinkBanner url={inviteLink} onDismiss={() => setInviteLink(null)} />
          ) : null}
        </div>
      ) : null}

      {/* Pending/expired invites section */}
      {canInvite ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t('invites_section_title')}</h2>
          {invitesLoading ? (
            <p className="text-sm text-muted-foreground">{t('invites_loading')}</p>
          ) : invitesError ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">{invitesError}</p>
              <button
                type="button"
                onClick={() => void loadInvites()}
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                {t('retry')}
              </button>
            </div>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('invites_empty')}</p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {invites.map((invite) => {
                const isExpired = invite.status === 'expired'
                const contactDisplay = invite.phone ?? invite.email ?? '—'
                return (
                  <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {contactDisplay}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            isExpired
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                          )}
                        >
                          {isExpired ? t('invite_status_expired') : t('invite_status_pending')}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{roleLabel(invite)}</span>
                        <span>·</span>
                        <span>{t('invite_expires', { date: formatLocalDate(invite.expiresAt, locale) })}</span>
                      </div>
                    </div>
                    {isOnline ? (
                      <div className="flex shrink-0 gap-2">
                        {isExpired ? (
                          <button
                            type="button"
                            onClick={() => void handleResendInvite(invite.id)}
                            disabled={resendingId === invite.id}
                            className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                          >
                            {resendingId === invite.id ? t('invite_resending') : t('invite_resend_action')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleCancelInvite(invite.id)}
                          disabled={cancellingId === invite.id}
                          className="text-xs font-medium text-destructive underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                        >
                          {cancellingId === invite.id ? t('invite_cancelling') : t('invite_cancel_action')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
          {inviteActionError ? (
            <p className="mt-2 text-sm text-destructive">{inviteActionError}</p>
          ) : null}
          {inviteLink ? (
            <InviteLinkBanner url={inviteLink} onDismiss={() => setInviteLink(null)} />
          ) : null}
        </div>
      ) : null}

      {/* Team members section */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t('members_section_title')}</h2>

        {membersLoading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : membersError ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-destructive">{membersError}</p>
            <button
              type="button"
              onClick={() => void loadMembers()}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {t('retry')}
            </button>
          </div>
        ) : activeMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {activeMembers.map((member) => {
              const isCurrentUser = member.userId === currentUserId
              const isOwner = member.roleName === 'OWNER' || member.role === 'OWNER'
              const isRoleEditOpen = roleEdit?.userId === member.userId
              const isRemoveOpen = removeConfirm?.userId === member.userId
              const displayName = member.name ?? member.email ?? member.phone ?? member.userId

              return (
                <div key={member.userId} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {displayName}
                          </span>
                          {isCurrentUser ? (
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {t('you_label')}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{roleLabel(member)}</span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              member.status === BusinessMemberStatus.ACTIVE
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                            )}
                          >
                            {member.status === BusinessMemberStatus.ACTIVE
                              ? t('status_active')
                              : t('status_pending')}
                          </span>
                          <span>{t('joined', { date: formatLocalDate(member.joinedAt, locale) })}</span>
                        </div>
                      </div>
                    </div>

                    {canManage && !isCurrentUser && !isOwner && isOnline ? (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRoleEdit(
                              isRoleEditOpen
                                ? null
                                : { userId: member.userId, currentRoleId: member.roleId, selectedRoleId: member.roleId },
                            )
                          }
                          className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          {t('change_role_action')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRemoveConfirm(
                              isRemoveOpen ? null : { userId: member.userId, name: displayName },
                            )
                          }
                          className="text-xs font-medium text-destructive underline underline-offset-2 hover:opacity-80"
                        >
                          {t('remove_action')}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Inline role editor */}
                  {isRoleEditOpen && roleEdit ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-secondary/50 px-3 py-3">
                      <span className="text-xs font-medium text-muted-foreground">{t('change_role_title')}</span>
                      <RoleSelect
                        value={roleEdit.selectedRoleId}
                        onChange={(id) => setRoleEdit({ ...roleEdit, selectedRoleId: id })}
                        className="w-44"
                      />
                      <Button
                        variant="primary"
                        onClick={() => void handleRoleChange()}
                        disabled={roleChanging || roleEdit.selectedRoleId === roleEdit.currentRoleId}
                      >
                        {roleChanging ? t('change_role_saving') : t('change_role_title')}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setRoleEdit(null)}
                        className="text-xs text-muted-foreground underline underline-offset-2"
                      >
                        {t('remove_cancel')}
                      </button>
                      {roleChangeError ? (
                        <p className="w-full text-xs text-destructive">{roleChangeError}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Inline remove confirm */}
                  {isRemoveOpen && removeConfirm ? (
                    <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3">
                      <p className="text-sm font-medium text-foreground">
                        {t('remove_confirm_title', { name: removeConfirm.name })}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t('remove_confirm_body')}</p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setRemoveConfirm(null)}
                          disabled={removing}
                        >
                          {t('remove_cancel')}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => void handleRemove()}
                          disabled={removing}
                        >
                          {removing ? t('removing') : t('remove_confirm_action')}
                        </Button>
                      </div>
                      {removeError ? (
                        <p className="mt-2 text-xs text-destructive">{removeError}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
