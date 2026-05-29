import { NestFactory } from '@nestjs/core'
import { VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { logger } from '@biztrack/logger'
import { AppModule } from './app.module'
import { mountBullBoard } from './common/queues/bull-board'
import { RedisService } from './common/redis/redis.service'
import { NodeEnv, type AppConfig } from './config/configuration'
import { createI18nValidationPipe } from './common/pipes/i18n-validation.pipe'
import cookieParser from 'cookie-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  const config = app.get<ConfigService<AppConfig>>(ConfigService)
  const redis = app.get<RedisService>(RedisService)
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

  if (nodeEnv !== NodeEnv.PRODUCTION) {
    const bullBoardPath = mountBullBoard(app)
    logger.log(`Bull Board is available at ${bullBoardPath}`, 'Bootstrap')
  }

  const redisState = redis.getConnectionState()
  logger.log(
    `Redis/Bull connection state: ${redisState.configured ? redisState.status : 'not_configured'}`,
    'Bootstrap',
  )

  const port = config.get('PORT', { infer: true }) ?? 3001
  await app.listen(port, '::') // Listen on all interfaces (IPv4 & IPv6)

  logger.log(`API is running on port ${port}`, 'Bootstrap');
}

bootstrap()
