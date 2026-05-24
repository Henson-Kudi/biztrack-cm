import { Inject, Injectable } from '@nestjs/common'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { Notification } from '@/entities/notification.entity'

export interface WhatsAppSendResult {
  providerMessageId?: string
}

@Injectable()
export class WhatsAppProvider {
  constructor(@Inject(LOGGER) private logger: Logger) {
    this.logger.setContext('WhatsAppProvider')
  }

  /**
   * Send a WhatsApp notification via the Meta Cloud API.
   *
   * Currently a stub — logs the message.
   * Replace with the real Meta Business Cloud API client once the
   * WhatsApp Business Account and phone-number registration are complete.
   */
  async send(notification: Notification): Promise<WhatsAppSendResult> {
    this.logger.warn(
      '[STUB] WhatsApp provider not configured — message not actually sent',
      'WhatsAppProvider',
      {
        notificationId: notification.id,
        recipient: notification.recipient,
      },
    )

    return { providerMessageId: `stub-wa-${notification.id}` }
  }
}
