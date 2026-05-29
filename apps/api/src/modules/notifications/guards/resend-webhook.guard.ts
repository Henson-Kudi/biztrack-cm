import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { RedisService } from '@/common/redis/redis.service'
import { EmailProvider } from '../providers/email.provider'

export const RESEND_WEBHOOK_IDEMPOTENCY_TTL_S = 86_400 // 24 hours

export interface ResendWebhookRequest extends Request {
  _svixId?: string
  _svixDuplicate?: boolean
  rawBody?: Buffer
}

@Injectable()
export class ResendWebhookGuard implements CanActivate {
  constructor(
    private emailProvider: EmailProvider,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ResendWebhookRequest>()

    const rawBody = req.rawBody
    if (!rawBody) throw new UnauthorizedException('Missing raw body')

    const svixId = req.headers['svix-id']
    const svixTimestamp = req.headers['svix-timestamp']
    const svixSignature = req.headers['svix-signature']

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new UnauthorizedException('Missing svix headers')
    }

    const svixIdStr = String(svixId)

    // Delegate signature verification to the email provider (all Resend logic lives there)
    this.emailProvider.verifyWebhook(rawBody.toString(), {
      'svix-id': svixIdStr,
      'svix-timestamp': String(svixTimestamp),
      'svix-signature': String(svixSignature),
    })

    // Idempotency: flag duplicates so the controller can skip re-processing
    const alreadyProcessed = await this.redisService.get(`whook:resend:${svixIdStr}`)
    req._svixId = svixIdStr
    req._svixDuplicate = Boolean(alreadyProcessed)

    return true
  }
}
