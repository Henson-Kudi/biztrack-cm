import { Inject, Injectable } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import { Repository } from 'typeorm'
import type { AppConfig } from '@/config/configuration'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@/entities/notification.entity'
import { PendingInvite } from '@/entities/pending-invite.entity'
import {
  NOTIFICATIONS_QUEUE,
  SEND_INVITE_NOTIFICATIONS_JOB,
  SEND_NOTIFICATION_JOB,
  type NotificationJobData,
  type SendInviteNotificationsJobData,
  type SendNotificationJobData,
} from '../constants/notifications.constants'
import { NotificationsService } from '../services/notifications.service'
import { EmailProvider } from '../providers/email.provider'
import { SmsProvider } from '../providers/sms.provider'
import { WhatsAppProvider } from '../providers/whatsapp.provider'

@Injectable()
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(PendingInvite)
    private readonly pendingInvitesRepo: Repository<PendingInvite>,
    private readonly emailProvider: EmailProvider,
    private readonly smsProvider: SmsProvider,
    private readonly whatsAppProvider: WhatsAppProvider,
    private readonly config: ConfigService<AppConfig>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<unknown> {
    switch (job.name) {
      case SEND_NOTIFICATION_JOB:
        return this.processSendNotification(job as Job<SendNotificationJobData>)
      case SEND_INVITE_NOTIFICATIONS_JOB:
        return this.processInviteNotifications(job as Job<SendInviteNotificationsJobData>)
      default:
        this.logger.warn('Skipping unknown notification job', 'NotificationsProcessor', {
          jobId: job.id,
          jobName: job.name,
        })
        return { status: 'skipped', reason: 'unknown_job' }
    }
  }

  // ---------------------------------------------------------------------------
  // Send a single persisted notification record via the appropriate provider
  // ---------------------------------------------------------------------------
  private async processSendNotification(job: Job<SendNotificationJobData>): Promise<unknown> {
    const { notificationId } = job.data

    this.logger.log('Processing send-notification job', 'NotificationsProcessor', {
      jobId: job.id,
      notificationId,
      attemptsMade: job.attemptsMade,
    })

    const notification = await this.notificationsService.findById(notificationId)

    if (!notification) {
      this.logger.warn('Notification not found — skipping', 'NotificationsProcessor', {
        notificationId,
      })
      return { status: 'skipped', reason: 'not_found' }
    }

    await this.notificationsService.incrementAttempts(notificationId)

    try {
      const { providerMessageId, provider } = await this.dispatchToProvider(notification)
      await this.notificationsService.markSent(notificationId, providerMessageId, provider)

      this.logger.log('Notification sent', 'NotificationsProcessor', {
        notificationId,
        channel: notification.channel,
        providerMessageId,
      })

      return { status: 'sent', notificationId, providerMessageId }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)

      this.logger.error('Notification send failed', 'NotificationsProcessor', {
        notificationId,
        channel: notification.channel,
        error: reason,
        attemptsMade: job.attemptsMade,
      })

      if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
        await this.notificationsService.markFailed(notificationId, reason)
      }

      throw err
    }
  }

  // ---------------------------------------------------------------------------
  // Fan out invite notifications across all available channels
  // This job creates the notification records AND sends — entirely in the worker.
  // ---------------------------------------------------------------------------
  private async processInviteNotifications(
    job: Job<SendInviteNotificationsJobData>,
  ): Promise<unknown> {
    const { inviteId, businessName, inviterName } = job.data

    this.logger.log('Processing send-invite-notifications job', 'NotificationsProcessor', {
      jobId: job.id,
      inviteId,
    })

    const invite = await this.pendingInvitesRepo.findOne({ where: { id: inviteId } })

    if (!invite) {
      this.logger.warn('Invite not found — skipping', 'NotificationsProcessor', { inviteId })
      return { status: 'skipped', reason: 'invite_not_found' }
    }

    const appUrl = this.config.get<string>('APP_URL', { infer: true })
    if (!appUrl) {
      this.logger.warn('APP_URL not set — invite notifications cannot be sent', 'NotificationsProcessor', { inviteId })
      return { status: 'skipped', reason: 'no_app_url' }
    }

    const inviteTtlDays = this.config.get<number>('INVITE_TTL_DAYS', { infer: true }) ?? 7
    const inviteUrl = `${appUrl}/en/invite?token=${invite.token}`
    const displayInviter = inviterName ?? 'Someone'

    this.logger.log('Sending invite notifications', 'NotificationsProcessor', {
      inviteId,
      businessName,
      inviterName,
      inviteUrl,
    })

    const sent: string[] = []
    const failed: string[] = []

    if (invite.email) {
      const subject = `${displayInviter} invited you to join ${businessName} on BizTrack`
      const body = [
        `Hi,`,
        ``,
        `${displayInviter} has invited you to join ${businessName} on BizTrack.`,
        ``,
        `Click the link below to accept your invitation:`,
        `${inviteUrl}`,
        ``,
        `This invitation expires in ${inviteTtlDays} days.`,
        ``,
        `If you did not expect this invitation, you can safely ignore this email.`,
      ].join('\n')

      const result = await this.createAndSend({
        channel: NotificationChannel.EMAIL,
        recipient: invite.email,
        subject,
        body,
        metadata: { inviteUrl, businessName, inviterName },
        businessId: invite.businessId,
      })

      result === 'ok' ? sent.push('email') : failed.push('email')
    }

    if (invite.phone) {
      const smsBody =
        `${displayInviter} invited you to join ${businessName} on BizTrack. ` +
        `Accept here: ${inviteUrl}`

      const smsResult = await this.createAndSend({
        channel: NotificationChannel.SMS,
        recipient: invite.phone,
        body: smsBody,
        metadata: { inviteUrl, businessName, inviterName },
        businessId: invite.businessId,
      })

      const waResult = await this.createAndSend({
        channel: NotificationChannel.WHATSAPP,
        recipient: invite.phone,
        body: smsBody,
        metadata: { inviteUrl, businessName, inviterName },
        businessId: invite.businessId,
      })

      smsResult === 'ok' ? sent.push('sms') : failed.push('sms')
      waResult === 'ok' ? sent.push('whatsapp') : failed.push('whatsapp')
    }

    this.logger.log('Invite notifications processed', 'NotificationsProcessor', {
      inviteId,
      sent,
      failed,
    })

    return { status: 'done', inviteId, sent, failed }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Create a notification record, call the provider, and persist the result. */
  private async createAndSend(opts: {
    channel: NotificationChannel
    recipient: string
    subject?: string
    body: string
    metadata?: Record<string, unknown>
    businessId?: string
  }): Promise<'ok' | 'failed'> {
    const notification = this.notificationsRepo.create({
      channel: opts.channel,
      type: NotificationType.INVITE,
      recipient: opts.recipient,
      subject: opts.subject ?? null,
      body: opts.body,
      metadata: opts.metadata ?? null,
      businessId: opts.businessId ?? null,
      status: NotificationStatus.PENDING,
      attempts: 1,
    })

    await this.notificationsRepo.save(notification)

    try {
      const { providerMessageId, provider } = await this.dispatchToProvider(notification)

      await this.notificationsRepo.update(notification.id, {
        status: NotificationStatus.SENT,
        providerMessageId: providerMessageId ?? null,
        provider: provider ?? null,
        sentAt: new Date(),
      })

      return 'ok'
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)

      await this.notificationsRepo.update(notification.id, {
        status: NotificationStatus.FAILED,
        failedAt: new Date(),
        failureReason: reason,
      })

      this.logger.error('Invite channel send failed', 'NotificationsProcessor', {
        notificationId: notification.id,
        channel: opts.channel,
        error: reason,
      })

      return 'failed'
    }
  }

  private async dispatchToProvider(
    notification: Notification,
  ): Promise<{ providerMessageId?: string; provider?: string }> {
    switch (notification.channel) {
      case NotificationChannel.EMAIL:
        return this.emailProvider.send(notification)
      case NotificationChannel.SMS:
        return this.smsProvider.send(notification)
      case NotificationChannel.WHATSAPP:
        return this.whatsAppProvider.send(notification)
      default:
        this.logger.warn('Unknown notification channel', 'NotificationsProcessor', {
          notificationId: notification.id,
          channel: notification.channel,
        })
        return {}
    }
  }
}
