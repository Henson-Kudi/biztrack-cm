import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Public } from '@/common/decorators/public.decorator'
import { NotificationsService } from '../services/notifications.service'

/**
 * Webhook endpoints for delivery-status callbacks from notification providers.
 *
 * These routes are intentionally public — they are called by external services.
 * TODO: add HMAC signature verification per-provider before going to production.
 */
@Controller('notifications/webhooks')
export class NotificationsWebhookController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * SendGrid event webhook.
   * SendGrid POSTs an array of event objects.
   * Relevant event types: 'delivered', 'bounce', 'dropped', 'spamreport'.
   */
  @Public()
  @Post('email')
  @HttpCode(HttpStatus.OK)
  async sendgridWebhook(@Body() events: Record<string, unknown>[]): Promise<void> {
    const eventList = Array.isArray(events) ? events : [events]

    for (const event of eventList) {
      const messageId = event['sg_message_id'] as string | undefined
      const eventType = event['event'] as string | undefined

      if (!messageId || !eventType) continue

      // SendGrid appends a filter-specific suffix after a dot — strip it.
      const providerMessageId = messageId.split('.')[0] || ''

      if (eventType === 'delivered') {
        await this.notificationsService.markDelivered(providerMessageId)
      }
    }
  }

  /**
   * SMS provider webhook (MTN / Orange / Africa's Talking — TBD).
   * Shape will vary per provider; parse providerMessageId and status.
   */
  @Public()
  @Post('sms')
  @HttpCode(HttpStatus.OK)
  async smsWebhook(@Body() payload: Record<string, unknown>): Promise<void> {
    // TODO: parse provider-specific payload and call markDelivered / markFailed
    void payload
  }

  /**
   * Meta WhatsApp Cloud API webhook.
   * Meta sends a POST for status updates (sent, delivered, read, failed).
   */
  @Public()
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  async whatsappWebhook(@Body() payload: Record<string, unknown>): Promise<void> {
    // TODO: parse Meta Cloud API statuses and call markDelivered / markFailed
    void payload
  }

  /**
   * Meta requires a GET challenge during webhook registration.
   * Add a @Get('whatsapp') handler here once the webhook URL is registered.
   */
}
