import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Webhook } from 'svix'
import { createHttpClient } from '@biztrack/http-client'
import type { AppConfig } from '@/config/configuration'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { Notification } from '@/entities/notification.entity'

export const RESEND_PROVIDER = 'resend'

export interface EmailSendResult {
  providerMessageId?: string
  provider: string
}

export interface RawEmailPayload {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  reply_to?: string
}

@Injectable()
export class EmailProvider {
  private readonly resendClient: ReturnType<typeof createHttpClient> | null
  private readonly webhookSecret: string
  private readonly validSenderDomains: string[]
  private readonly defaultFromEmail:string
  constructor(
    private config: ConfigService<AppConfig>,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('EmailProvider');
    this.resendClient = this.buildHttpClient();
    this.webhookSecret = this.config.get('RESEND_WEBHOOK_SECRET', { infer: true }) || '';
    this.validSenderDomains = this.config.get('RESEND_SENDER_DOMAINS', { infer: true }) || [];
    this.defaultFromEmail = `BizTrack CM <noreply@${this.validSenderDomains?.[0]}>`
  }

  /** Send a notification-record email through Resend. */
  async send(notification: Notification): Promise<EmailSendResult> {
    const result = await this.sendRaw({
      from: notification.sender ?? this.defaultFromEmail,
      to: notification.recipient,
      subject: notification.subject ?? '',
      html: notification.body,
    })

    return { providerMessageId: result.id, provider: RESEND_PROVIDER }
  }

  /** Send a raw email payload through Resend (e.g. waitlist notifications). */
  async sendRaw(payload: RawEmailPayload): Promise<{ id?: string }> {

    if (!this.resendClient) return {}

    // Validate sender domain to fail fast before making API call (which would fail anyway if sender not verified in Resend dashboard)
    if (!this.isValidSender(payload.from)) {
      this.logger.warn(`Invalid sender email domain: ${payload.from}`, 'EmailProvider')
      return {}
    }

    this.logger.debug(`Sending email via Resend: ${payload.subject} to ${payload.to}`, 'EmailProvider')
    const response = await this.resendClient.post<{ id: string }>('/emails', payload)
    return { id: response.data?.id }
  }

  /**
   * Fetch a received (inbound) email's full content from Resend.
   * The email.received webhook only carries metadata; this call retrieves the body.
   */
  async fetchReceivedEmail(emailId: string): Promise<{
    from?: string
    subject?: string
    html?: string
    text?: string
  } | null> {
    if (!this.resendClient) return null

    try {
      const response = await this.resendClient.get<{
        from?: string
        subject?: string
        html?: string
        text?: string
      }>(`/emails/${emailId}`)
      return response.data ?? null
    } catch (err) {
      this.logger.error('Failed to fetch received email from Resend', 'EmailProvider', {
        emailId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Verify a Resend webhook signature using Svix.
   * Throws UnauthorizedException if the signature is invalid.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): void {
    if (!this.webhookSecret) throw new UnauthorizedException('Webhook secret not configured')

    try {
      const wh = new Webhook(this.webhookSecret)
      wh.verify(rawBody, headers)
    } catch {
      throw new UnauthorizedException('Invalid webhook signature')
    }
  }

  private buildHttpClient() {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true })
    const baseURL = this.config.get('RESEND_API_BASE_URL', { infer: true }) ?? 'https://api.resend.com'

    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not set — email not actually sent', 'EmailProvider')
      return null
    }

    return createHttpClient({
      baseURL,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    })
  }

  get noReplySender(): string {
    return this.defaultFromEmail
  }

  get waitingListReplier(): string {
    return `info@${this.validSenderDomains?.[0]}`;
  }

  get generalEnquiriesReplier(): string {
    return `hello@${this.validSenderDomains?.[0]}`;
  }

  private extractDomain(email: string): string | null {
    const match = email.match(/@([^>]+)/) // extract domain from email address, allowing for formats like "Name <email>"
    return match ? match[1]!.toLowerCase() : null
  }

  isValidSender(email: string): boolean {
    const domain = this.extractDomain(email)
    if (!domain) return false
    return this.validSenderDomains.includes(domain)
  }
}
