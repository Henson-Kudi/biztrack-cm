import { Inject, Injectable } from '@nestjs/common'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { Notification } from '@/entities/notification.entity'

export interface SmsSendResult {
  providerMessageId?: string
}

@Injectable()
export class SmsProvider {
  constructor(@Inject(LOGGER) private logger: Logger) {
    this.logger.setContext('SmsProvider')
  }

  /**
   * Send an SMS notification.
   *
   * Currently a stub — logs the message.
   * Replace with the chosen provider (MTN, Orange, or Africa's Talking)
   * once the contract is finalised.
   */
  async send(notification: Notification): Promise<SmsSendResult> {
    this.logger.warn('[STUB] SMS provider not configured — message not actually sent', 'SmsProvider', {
      notificationId: notification.id,
      recipient: notification.recipient,
    })

    return { providerMessageId: `stub-sms-${notification.id}` }
  }
}
