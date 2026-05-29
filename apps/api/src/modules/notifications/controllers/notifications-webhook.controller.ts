import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { Public } from '@/common/decorators/public.decorator'
import { RedisService } from '@/common/redis/redis.service'
import { NotificationsService } from '../services/notifications.service'
import { ResendWebhookGuard, RESEND_WEBHOOK_IDEMPOTENCY_TTL_S } from '../guards/resend-webhook.guard'
import type { ResendWebhookRequest } from '../guards/resend-webhook.guard'
import { RESEND_PROVIDER } from '../providers/email.provider'

interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from?: string
    to?: string[]
    subject?: string
    attachments?: { id: string; filename: string; content_type: string }[]
    [key: string]: unknown
  }
}

@Controller('notifications/webhooks')
export class NotificationsWebhookController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Resend email event webhook.
   * Signature is verified and idempotency checked by ResendWebhookGuard before this handler runs.
   * See: https://resend.com/docs/dashboard/webhooks/event-types
   */
  @Public()
  @UseGuards(ResendWebhookGuard)
  @Post('email')
  @HttpCode(HttpStatus.OK)
  async resendWebhook(
    @Req() req: ResendWebhookRequest,
    @Body() event: ResendWebhookEvent,
  ): Promise<void> {
    // Already processed — acknowledge without re-processing (idempotent)
    if (req._svixDuplicate) return

    const emailId = event?.data?.email_id
    if (!emailId) return

    switch (event.type) {
      case 'email.delivered':
        await this.notificationsService.markDelivered(emailId, RESEND_PROVIDER)
        break

      case 'email.bounced':
        await this.notificationsService.markFailedByProvider(emailId, 'bounced', RESEND_PROVIDER)
        break

      case 'email.failed':
        await this.notificationsService.markFailedByProvider(emailId, 'failed', RESEND_PROVIDER)
        break

      case 'email.complained':
        await this.notificationsService.markFailedByProvider(emailId, 'complained', RESEND_PROVIDER)
        break

      case 'email.suppressed':
        await this.notificationsService.markFailedByProvider(emailId, 'suppressed', RESEND_PROVIDER)
        break

      case 'email.received':
        // Webhook only carries metadata — forwardInboundEmail fetches the body then resends to founder
        await this.notificationsService.forwardInboundEmail({
          emailId,
          from: event.data.from,
          subject: event.data.subject,
        })
        break

      // email.sent, email.opened, email.clicked, email.scheduled,
      // email.delivery_delayed — no action needed
      default:
        break
    }

    // Mark this svix-id as processed to prevent replay / duplicate delivery
    if (req._svixId) {
      await this.redisService.setex(
        `whook:resend:${req._svixId}`,
        RESEND_WEBHOOK_IDEMPOTENCY_TTL_S,
        '1',
      )
    }
  }

  /**
   * SMS provider webhook (MTN / Orange / Africa's Talking — TBD).
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
}
