import { NestFactory } from '@nestjs/core'
import { VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { logger } from '@biztrack/logger'
import { AppModule } from './app.module'
import { NodeEnv, type AppConfig } from './config/configuration'
import { createI18nValidationPipe } from './common/pipes/i18n-validation.pipe'
import cookieParser from 'cookie-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const config = app.get<ConfigService<AppConfig>>(ConfigService)
  const nodeEnv = config.get('NODE_ENV', { infer: true })
  const corsOriginsRaw = config.get('CORS_ORIGINS', { infer: true })
  const allowNullOriginRaw = config.get('CORS_ALLOW_NULL_ORIGIN', { infer: true })
  const allowNullOrigin = allowNullOriginRaw === 'true'
  const allowedOrigins = new Set(
    (corsOriginsRaw ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  const allowAllInDev = nodeEnv !== NodeEnv.PRODUCTION && allowedOrigins.size === 0

  if (nodeEnv === NodeEnv.PRODUCTION && allowedOrigins.size === 0) {
    logger.warn('CORS_ORIGINS is empty in production. No browser origins will be allowed.', 'Bootstrap')
  }

  app.enableCors({
    origin: (origin, callback) => {
      logger.debug(origin, 'Incoming request origin...')
      if (!origin) return callback(null, true)
      if (origin === 'null' && allowNullOrigin) return callback(null, true)
      if (allowAllInDev) return callback(null, true)
      if (allowedOrigins.has(origin)) return callback(null, true)
      return callback(new Error(`Origin not allowed by CORS: ${origin}`), false)
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Request-Id', 'X-Skip-Auth-Refresh', 'X-Skip-Auth'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  })
  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  })

  app.useGlobalPipes(createI18nValidationPipe())
  app.use(cookieParser())

  const port = config.get('API_PORT', { infer: true }) ?? 3001

  await app.listen(port)

  logger.log(`API is running on port ${port}`, 'Bootstrap');
}

bootstrap()
