import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '@/config/configuration'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { Notification } from '@/entities/notification.entity'

export interface EmailSendResult {
  providerMessageId?: string
}

@Injectable()
export class EmailProvider {
  constructor(
    private config: ConfigService<AppConfig>,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('EmailProvider')
  }

  /**
   * Send an email notification.
   *
   * Currently a stub — logs the message and returns a synthetic message ID.
   * Replace this implementation with the real SendGrid client once API keys
   * are provisioned.
   */
  async send(notification: Notification): Promise<EmailSendResult> {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY', { infer: true })

    if (!apiKey) {
      this.logger.warn(
        '[STUB] SENDGRID_API_KEY not set — email not actually sent',
        'EmailProvider',
        {
          notificationId: notification.id,
          recipient: notification.recipient,
          subject: notification.subject,
        },
      )
      return { providerMessageId: `stub-email-${notification.id}` }
    }

    // TODO: replace with real SendGrid client
    // const sgMail = require('@sendgrid/mail')
    // sgMail.setApiKey(apiKey)
    // const [response] = await sgMail.send({ to, from, subject, text, html })
    // return { providerMessageId: response.headers['x-message-id'] }

    this.logger.log('[STUB] Sending email via SendGrid', 'EmailProvider', {
      notificationId: notification.id,
      recipient: notification.recipient,
      subject: notification.subject,
    })

    return { providerMessageId: `stub-email-${notification.id}` }
  }
}
