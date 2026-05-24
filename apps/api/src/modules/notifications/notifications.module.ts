import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Notification } from '@/entities/notification.entity'
import { PendingInvite } from '@/entities/pending-invite.entity'
import { NOTIFICATIONS_QUEUE } from './constants/notifications.constants'
import { EmailProvider } from './providers/email.provider'
import { SmsProvider } from './providers/sms.provider'
import { WhatsAppProvider } from './providers/whatsapp.provider'
import { NotificationsService } from './services/notifications.service'
import { NotificationsProcessor } from './processors/notifications.processor'
import { NotificationsWebhookController } from './controllers/notifications-webhook.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, PendingInvite]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  controllers: [NotificationsWebhookController],
  providers: [
    EmailProvider,
    SmsProvider,
    WhatsAppProvider,
    NotificationsService,
    NotificationsProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
