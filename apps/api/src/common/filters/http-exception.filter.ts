import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common'
import type { Response } from 'express'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { RequestWithId } from '../http/http-types'
import { AppException } from '../exceptions/app.exception'
import { I18nContext, I18nService } from 'nestjs-i18n'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER) private logger: Logger,
    private i18n: I18nService,
  ) {
    this.logger.setContext('HttpExceptionFilter')
  }

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<RequestWithId>()
    const res = ctx.getResponse<Response>()
    const requestId = req?.id ?? 'unknown'
    const lang = I18nContext.current(host)?.lang ?? 'fr'

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let code = 'INTERNAL_SERVER_ERROR'
    let details: unknown = undefined

    if (exception instanceof AppException) {
      status = exception.getStatus()
      message = exception.message
      code = exception.code
      details = exception.details
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      const response = exception.getResponse()
      if (typeof response === 'string') {
        message = response
      } else if (typeof response === 'object' && response) {
        const payload = response as Record<string, unknown>
        const msg = payload.message
        message = Array.isArray(msg) ? msg.join(', ') : (msg as string) ?? exception.message
        details = payload
      } else {
        message = exception.message
      }
      code = `HTTP_${status}`
    } else if (exception instanceof Error) {
      message = exception.message
    }

    if (typeof message === 'string' && message.startsWith('i18n:')) {
      const key = message.slice('i18n:'.length)
      message = await this.i18n.translate(key, { lang })
    } else if (typeof message === 'string' && this.isI18nKey(message)) {
      const translated = await this.i18n.translate(message, { lang })
      message =
        translated && translated !== message
          ? translated as string
          : await this.translateStatus(status, lang)
    } else if (status !== HttpStatus.INTERNAL_SERVER_ERROR && message === 'Internal server error') {
      message = await this.translateStatus(status, lang)
    }

    this.logger.error('Unhandled exception', 'HttpExceptionFilter', {
      requestId,
      status,
      code,
      message,
    })

    res.status(status).json({
      success: false,
      message,
      error: { code, details },
      requestId,
      timestamp: new Date().toISOString(),
    })
  }

  private async translateStatus(status: number, lang: string): Promise<string> {
    const statusMap: Record<number, string> = {
      400: 'errors.validation_failed',
      401: 'errors.unauthorized',
      402: 'errors.plan_upgrade_required',
      403: 'errors.forbidden',
      404: 'errors.not_found',
      429: 'errors.rate_limited',
      500: 'errors.server_error',
    }
    const key = statusMap[status] ?? 'errors.server_error'
    return await this.i18n.translate(key, { lang })
  }

  private isI18nKey(value: string): boolean {
    return /^[a-z]+(\.[a-z0-9_]+)+$/i.test(value)
  }
}
