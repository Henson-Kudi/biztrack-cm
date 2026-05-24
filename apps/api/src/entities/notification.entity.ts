import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum NotificationType {
  INVITE = 'invite',
  OTP = 'otp',
  PAYMENT_REMINDER = 'payment_reminder',
}

export enum NotificationStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

@Entity('notifications')
@Index('idx_notifications_status', ['status'])
@Index('idx_notifications_provider_message_id', ['providerMessageId'], {
  where: 'provider_message_id IS NOT NULL',
})
@Index('idx_notifications_business_id', ['businessId'], { where: 'business_id IS NOT NULL' })
export class Notification extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId?: string | null

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null

  @Column({ type: 'enum', enum: NotificationChannel })
  channel!: NotificationChannel

  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType

  /** Phone number or email address */
  @Column({ type: 'varchar', length: 320 })
  recipient!: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject?: string | null

  @Column({ type: 'text' })
  body!: string

  /** Template variables and any extra context used to build the message */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status!: NotificationStatus

  /** Provider-assigned message ID used to correlate webhook delivery events */
  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId?: string | null

  @Column({ type: 'int', default: 0 })
  attempts!: number

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  sentAt?: Date | null

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  failedAt?: Date | null

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string | null
}
