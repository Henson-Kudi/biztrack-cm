import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { JwtPayload } from '@biztrack/types'
import { AppUnauthorizedException } from '@/common/exceptions/app-exceptions'
import { SyncAuthService } from '../services/sync-auth.service'

@Injectable()
export class SyncTokenGuard implements CanActivate {
  constructor(private readonly syncAuthService: SyncAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string }
      user?: JwtPayload
    }>()

    const token = this.readBearerToken(request.headers?.authorization)
    request.user = await this.syncAuthService.authenticateSyncToken(token)
    return true
  }

  private readBearerToken(authorization?: string): string {
    const header = authorization?.trim() ?? ''
    const [scheme, token] = header.split(' ')

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new AppUnauthorizedException(
        'Sync authentication requires a bearer token.',
        'SYNC_TOKEN_REQUIRED',
      )
    }

    return token
  }
}
