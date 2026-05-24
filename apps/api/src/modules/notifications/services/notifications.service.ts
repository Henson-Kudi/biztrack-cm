import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
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

export interface CreateNotificationOptions {
  channel: NotificationChannel
  type: NotificationType
  recipient: string
  subject?: string
  body: string
  metadata?: Record<string, unknown>
  businessId?: string
  userId?: string
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepo: Repository<Notification>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private notificationsQueue: Queue<NotificationJobData>,
    @Inject(LOGGER) private logger: Logger,
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
  async markSent(notificationId: string, providerMessageId?: string): Promise<void> {
    await this.notificationsRepo.update(notificationId, {
      status: NotificationStatus.SENT,
      providerMessageId: providerMessageId ?? null,
      sentAt: new Date(),
    })
  }

  /** Update notification to DELIVERED when provider confirms receipt. */
  async markDelivered(providerMessageId: string): Promise<void> {
    const notification = await this.notificationsRepo.findOne({
      where: { providerMessageId },
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

  async findById(id: string): Promise<Notification | null> {
    return this.notificationsRepo.findOne({ where: { id } })
  }

  async incrementAttempts(notificationId: string): Promise<void> {
    await this.notificationsRepo.increment({ id: notificationId }, 'attempts', 1)
  }
}
