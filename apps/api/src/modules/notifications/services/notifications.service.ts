import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import type { Queue } from 'bullmq'
import { Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { AppConfig } from '@/config/configuration'
import type { WaitlistEntry } from '@/entities/waitlist-entry.entity'
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@/entities/notification.entity'
import {
  NOTIFICATIONS_QUEUE,
  SEND_INVITE_NOTIFICATIONS_JOB,
  SEND_NOTIFICATION_JOB,
  type NotificationJobData,
  type SendInviteNotificationsJobData,
  type SendNotificationJobData,
} from '../constants/notifications.constants'
import { EmailProvider, RESEND_PROVIDER } from '../providers/email.provider'

export interface CreateNotificationOptions {
  channel: NotificationChannel
  type: NotificationType
  recipient: string
  subject?: string
  body: string
  metadata?: Record<string, unknown>
  businessId?: string
  userId?: string
  sender?: string
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepo: Repository<Notification>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private notificationsQueue: Queue<NotificationJobData>,
    @Inject(LOGGER) private logger: Logger,
    private configService: ConfigService<AppConfig>,
    private emailProvider: EmailProvider,
  ) {
    this.logger.setContext('NotificationsService')
  }

  /**
   * Persist a single notification record and enqueue a send job.
   * Used for general notifications (OTP, payment reminders, etc.).
   * For invites, use enqueueInviteNotifications instead.
   */
  async createAndEnqueue(opts: CreateNotificationOptions): Promise<Notification> {
    const notification = this.notificationsRepo.create({
      channel: opts.channel,
      type: opts.type,
      recipient: opts.recipient,
      subject: opts.subject ?? null,
      body: opts.body,
      metadata: opts.metadata ?? null,
      businessId: opts.businessId ?? null,
      userId: opts.userId ?? null,
      status: NotificationStatus.PENDING,
      attempts: 0,
      sender: opts.sender ?? null,
    })

    await this.notificationsRepo.save(notification)

    await this.notificationsQueue.add(
      SEND_NOTIFICATION_JOB,
      { notificationId: notification.id } satisfies SendNotificationJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        jobId: `notif-${notification.id}`,
      },
    )

    await this.notificationsRepo.update(notification.id, { status: NotificationStatus.QUEUED })
    notification.status = NotificationStatus.QUEUED

    this.logger.log('Notification enqueued', 'NotificationsService', {
      notificationId: notification.id,
      channel: opts.channel,
      type: opts.type,
    })

    return notification
  }

  /**
   * Enqueue a single job that tells the processor to fan out invite notifications
   * across all available channels (email, SMS, WhatsApp).
   *
   * No DB writes happen here — the processor creates notification records and
   * calls providers entirely asynchronously.
   */
  async enqueueInviteNotifications(
    inviteId: string,
    businessName: string,
    inviterName?: string,
  ): Promise<void> {
    await this.notificationsQueue.add(
      SEND_INVITE_NOTIFICATIONS_JOB,
      { inviteId, businessName, inviterName } satisfies SendInviteNotificationsJobData,
      {
        attempts: 1, // fan-out is one-shot; individual send jobs handle their own retries
        jobId: `invite-notif-${inviteId}`,
      },
    )

    this.logger.log('Invite notifications job enqueued', 'NotificationsService', {
      inviteId,
      businessName,
    })
  }

  /** Update notification to SENT after successful delivery. */
  async markSent(notificationId: string, providerMessageId?: string, provider?: string): Promise<void> {
    await this.notificationsRepo.update(notificationId, {
      status: NotificationStatus.SENT,
      providerMessageId: providerMessageId ?? null,
      provider: provider ?? null,
      sentAt: new Date(),
    })
  }

  /** Update notification to DELIVERED when provider confirms receipt. */
  async markDelivered(providerMessageId: string, provider: string): Promise<void> {
    const notification = await this.notificationsRepo.findOne({
      where: { providerMessageId, provider },
    })
    if (!notification) return

    await this.notificationsRepo.update(notification.id, {
      status: NotificationStatus.DELIVERED,
    })
  }

  /** Update notification to FAILED after all retries exhausted. */
  async markFailed(notificationId: string, reason: string): Promise<void> {
    await this.notificationsRepo.update(notificationId, {
      status: NotificationStatus.FAILED,
      failedAt: new Date(),
      failureReason: reason,
    })
  }

  /** Mark notification FAILED by provider message ID (e.g. from a webhook). */
  async markFailedByProvider(providerMessageId: string, reason: string, provider: string): Promise<void> {
    const notification = await this.notificationsRepo.findOne({
      where: { providerMessageId, provider },
    })
    if (!notification) return

    await this.notificationsRepo.update(notification.id, {
      status: NotificationStatus.FAILED,
      failedAt: new Date(),
      failureReason: reason,
    })
  }

  async findById(id: string): Promise<Notification | null> {
    return this.notificationsRepo.findOne({ where: { id } })
  }

  /**
   * Forward an inbound email (email.received webhook) to the founder.
   * Fetches the full body from Resend first since the webhook only contains metadata.
   */
  async forwardInboundEmail(data: {
    emailId: string
    from?: string
    subject?: string
  }): Promise<void> {
    const founderEmail = this.configService.get('FOUNDER_EMAIL', { infer: true })
    if (!founderEmail) {
      this.logger.warn('FOUNDER_EMAIL not set — skipping inbound email forward', 'NotificationsService')
      return
    }

    this.logger.debug('Forwarding inbound email to founder', 'NotificationsService', {
      emailId: data.emailId,
      from: data.from,
      subject: data.subject,
    })

    const content = await this.emailProvider.fetchReceivedEmail(data.emailId)
    if (!content) {
      this.logger.warn('Could not fetch inbound email body — skipping forward', 'NotificationsService', {
        emailId: data.emailId,
      })
      return
    }

    const subject = `[Fwd] ${data.subject ?? content.subject ?? '(no subject)'}`
    const body = content.html ?? content.text ?? ''

    const notification = this.notificationsRepo.create({
      channel: NotificationChannel.EMAIL,
      type: NotificationType.MARKETING,
      recipient: founderEmail,
      subject,
      body,
      status: NotificationStatus.PENDING,
      attempts: 0,
    })
    await this.notificationsRepo.save(notification)

    const result = await this.emailProvider.sendRaw({
      from: this.emailProvider.noReplySender,
      to: founderEmail,
      reply_to: data.from,
      subject,
      html: content.html,
      text: content.text,
    })

    if (result.id) {
      await this.markSent(notification.id, result.id, RESEND_PROVIDER)
    } else {
      await this.markFailed(notification.id, 'Forward failed — no provider message ID returned')
    }
  }

  async incrementAttempts(notificationId: string): Promise<void> {
    await this.notificationsRepo.increment({ id: notificationId }, 'attempts', 1)
  }

  async sendWaitlistNotification(entry: WaitlistEntry): Promise<void> {
    const founderEmail = this.configService.get('FOUNDER_EMAIL', { infer: true })
    if (!founderEmail) {
      this.logger.warn('FOUNDER_EMAIL not set — skipping waitlist email')
      return
    }

    const subject = `🎉 New BizTrack CM waitlist signup — ${entry.name}`

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">BizTrack CM — New waitlist signup</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 24px;color:#F0F7F4">${entry.name} wants access</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:10px 12px;background:#112B20;border-radius:6px 6px 0 0;color:#8FBFAA;width:120px">Name</td><td style="padding:10px 12px;background:#112B20;border-radius:0 6px 0 0;font-weight:500">${entry.name}</td></tr>
          <tr><td style="padding:10px 12px;background:#0D2B1F;color:#8FBFAA">Email</td><td style="padding:10px 12px;background:#0D2B1F"><a href="mailto:${entry.email}" style="color:#1D9E75">${entry.email}</a></td></tr>
          <tr><td style="padding:10px 12px;background:#112B20;color:#8FBFAA">WhatsApp</td><td style="padding:10px 12px;background:#112B20"><a href="https://wa.me/${entry.phone.replace(/\s+/g, '')}" style="color:#1D9E75">${entry.phone}</a></td></tr>
          <tr><td style="padding:10px 12px;background:#0D2B1F;color:#8FBFAA">Language</td><td style="padding:10px 12px;background:#0D2B1F">${entry.locale === 'fr' ? '🇫🇷 French' : '🇬🇧 English'}</td></tr>
          <tr><td style="padding:10px 12px;background:#112B20;color:#8FBFAA">Source</td><td style="padding:10px 12px;background:#112B20">${entry.utm_source ?? '—'} / ${entry.utm_medium ?? '—'}</td></tr>
          <tr><td style="padding:10px 12px;background:#0D2B1F;border-radius:0 0 0 6px;color:#8FBFAA">Signed up</td><td style="padding:10px 12px;background:#0D2B1F;border-radius:0 0 6px 0">${entry.created_at.toLocaleString('en-GB', { timeZone: 'Africa/Douala' })} WAT</td></tr>
        </table>
        ${entry.is_duplicate ? `<div style="margin-top:16px;padding:10px 14px;background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.3);border-radius:8px;color:#F5A623;font-size:13px">⚠ This email address has signed up before.</div>` : ''}
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(29,158,117,.2);font-size:12px;color:#5A8A74">
          <strong style="color:#8FBFAA">Next step:</strong> Contact ${entry.name} on WhatsApp within 48 hours to schedule installation.
          <br><br>Reply-to this email or message directly: <a href="https://wa.me/${entry.phone.replace(/\s+/g, '')}" style="color:#1D9E75">Open WhatsApp →</a>
        </div>
      </div>
    `

    const text = `
New BizTrack CM waitlist signup

Name: ${entry.name}
Email: ${entry.email}
WhatsApp: ${entry.phone}
Language: ${entry.locale}
Signed up: ${entry.created_at.toISOString()}
${entry.is_duplicate ? 'NOTE: Duplicate email address.' : ''}

Next step: contact ${entry.name} on WhatsApp within 48 hours.
    `.trim()

    const isFr = entry.locale !== 'en'

    const confirmSubject = isFr
      ? `✓ Votre demande d'accès BizTrack CM a été reçue`
      : `✓ Your BizTrack CM early access request has been received`

    const confirmHtml = isFr
      ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px">BizTrack CM</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 16px;color:#F0F7F4">Bonjour ${entry.name} 👋</h2>
        <p style="font-size:15px;line-height:1.7;color:#8FBFAA;margin:0 0 20px">
          Merci de vous être inscrit sur la liste d'attente BizTrack CM.<br>
          Nous avons bien reçu votre demande d'accès anticipé.
        </p>
        <div style="background:#112B20;border:1px solid rgba(29,158,117,0.18);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="font-size:13px;color:#5A8A74;margin-bottom:4px">Étape suivante</div>
          <div style="font-size:15px;color:#F0F7F4;font-weight:500">
            Un agent BizTrack CM vous contactera sur WhatsApp (<strong style="color:#1D9E75">${entry.phone}</strong>) dans les 48 heures pour installer l'application gratuitement dans votre boutique.
          </div>
        </div>
        <p style="font-size:13px;color:#5A8A74;line-height:1.6;margin:0 0 8px">
          Des questions ? Écrivez-nous à <a href="mailto:${this.emailProvider.waitingListReplier}" style="color:#1D9E75">${this.emailProvider.waitingListReplier}</a>.
        </p>
        <p style="font-size:13px;color:#5A8A74;margin:0">
          À très bientôt,<br>
          <strong style="color:#8FBFAA">L'équipe BizTrack CM</strong>
        </p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(29,158,117,0.12);font-size:11px;color:#3A6A54;text-align:center">
          🇨🇲 Fait au Cameroun · Pour le Cameroun · <a href="https://hk-solutions.app" style="color:#1D9E75">biztrack.cm</a>
        </div>
      </div>`
      : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px">BizTrack CM</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 16px;color:#F0F7F4">Hi ${entry.name} 👋</h2>
        <p style="font-size:15px;line-height:1.7;color:#8FBFAA;margin:0 0 20px">
          Thank you for joining the BizTrack CM waitlist.<br>
          We've received your early access request.
        </p>
        <div style="background:#112B20;border:1px solid rgba(29,158,117,0.18);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="font-size:13px;color:#5A8A74;margin-bottom:4px">What happens next</div>
          <div style="font-size:15px;color:#F0F7F4;font-weight:500">
            A BizTrack CM agent will contact you on WhatsApp (<strong style="color:#1D9E75">${entry.phone}</strong>) within 48 hours to install the app for free in your shop.
          </div>
        </div>
        <p style="font-size:13px;color:#5A8A74;line-height:1.6;margin:0 0 8px">
          Questions? Email us at <a href="mailto:${this.emailProvider.waitingListReplier}" style="color:#1D9E75">${this.emailProvider.waitingListReplier}</a>.
        </p>
        <p style="font-size:13px;color:#5A8A74;margin:0">
          See you soon,<br>
          <strong style="color:#8FBFAA">The BizTrack CM team</strong>
        </p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(29,158,117,0.12);font-size:11px;color:#3A6A54;text-align:center">
          🇨🇲 Made in Cameroon · For Cameroon · <a href="https://hk-solutions.app" style="color:#1D9E75">biztrack.cm</a>
        </div>
      </div>`

    const confirmText = isFr
      ? `Bonjour ${entry.name},\n\nMerci pour votre inscription sur la liste d'attente BizTrack CM.\n\nUn agent vous contactera sur WhatsApp (${entry.phone}) dans les 48 heures.\n\nQuestions ? ${this.emailProvider.waitingListReplier}\n\nL'équipe BizTrack CM`
      : `Hi ${entry.name},\n\nThank you for joining the BizTrack CM waitlist.\n\nAn agent will contact you on WhatsApp (${entry.phone}) within 48 hours.\n\nQuestions? ${this.emailProvider.waitingListReplier}\n\nThe BizTrack CM team`

    // Create notification records so webhook delivery events can be correlated
    const [founderNotif, clientNotif] = await this.notificationsRepo.save([
      this.notificationsRepo.create({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.MARKETING,
        recipient: founderEmail,
        subject,
        body: html,
        status: NotificationStatus.PENDING,
        attempts: 0,
        sender: this.emailProvider.noReplySender,
      }),
      this.notificationsRepo.create({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.MARKETING,
        recipient: entry.email,
        subject: confirmSubject,
        body: confirmHtml,
        status: NotificationStatus.PENDING,
        attempts: 0,
        sender: this.emailProvider.noReplySender,
      }),
    ])

    const [founderResult, clientResult] = await Promise.allSettled([
      this.emailProvider.sendRaw({
        from: founderNotif?.sender!,
        to: founderEmail,
        reply_to: entry.email,
        subject,
        html,
        text,
      }),
      this.emailProvider.sendRaw({
        from: clientNotif?.sender!,
        to: entry.email,
        subject: confirmSubject,
        html: confirmHtml,
        text: confirmText,
      }),
    ])

    if (founderResult.status === 'fulfilled') {
      await this.markSent(founderNotif!.id, founderResult.value.id, RESEND_PROVIDER)
    } else {
      await this.markFailed(founderNotif!.id, String(founderResult.reason))
    }

    if (clientResult.status === 'fulfilled') {
      await this.markSent(clientNotif!.id, clientResult.value.id, RESEND_PROVIDER)
    } else {
      await this.markFailed(clientNotif!.id, String(clientResult.reason))
    }
  }
}
