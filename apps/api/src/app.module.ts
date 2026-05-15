import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { I18nModule } from 'nestjs-i18n'
import { AuthModule } from '@/modules/auth/auth.module'
import { UsersModule } from '@/modules/users/users.module'
import { BusinessModule } from '@/modules/business/business.module'
import { ProductsModule } from '@/modules/products/products.module'
import { SyncModule } from '@/modules/sync/sync.module'
import { PlansModule } from '@/modules/plans/plans.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module'
import { InventoryModule } from '@/modules/inventory/inventory.module'
import { ExpensesModule } from '@/modules/expenses/expenses.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { SalesModule } from '@/modules/sales/sales.module'
import { LoggerModule } from './logger/logger.module'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import { AppConfig, NodeEnv, validateEnv } from './config/configuration'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware'
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { QueuesModule } from './common/queues/queues.module'
import { RedisModule } from './common/redis/redis.module'
import { UserLocaleResolver } from './common/resolvers/user-locale.resolver'
import { User } from './entities/user.entity'
import { HealthController } from './health.controller'

const entitiesPath = join(__dirname, '**', '*.entity.{ts,js}').replace(/\\/g, '/')
const migrationsPath = join(__dirname, 'database', 'migrations', '*{.ts,.js}').replace(/\\/g, '/')

function resolveI18nPath() {
  const srcPath = resolve(process.cwd(), 'src', 'i18n')
  const candidates =
    process.env.NODE_ENV === NodeEnv.PRODUCTION
      ? [join(__dirname, 'i18n'), join(__dirname, 'i18n', 'i18n'), srcPath]
      : [srcPath, join(__dirname, 'i18n'), join(__dirname, 'i18n', 'i18n')]

  const hasTranslations = (basePath: string) =>
    existsSync(join(basePath, 'en')) || existsSync(join(basePath, 'fr'))

  return candidates.find(hasTranslations) ?? srcPath
}

@Module({
  controllers: [HealthController],
  imports: [
    LoggerModule,
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    I18nModule.forRootAsync({
      useFactory: () => {
        const i18nPath = resolveI18nPath()

        return {
          fallbackLanguage: 'fr',
          loaderOptions: {
            path: i18nPath,
            watch: process.env.NODE_ENV === 'development',
          },
          typesOutputPath: join(__dirname, '..', 'src', 'generated', 'i18n.generated.ts'),
        }
      },
      resolvers: [UserLocaleResolver],
      imports: [TypeOrmModule.forFeature([User])],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1, limit: 5 },
      { name: 'medium', ttl: 60, limit: 30 },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL', { infer: true }),
        entities: [entitiesPath],
        migrations: [migrationsPath],
        synchronize: false,
        logging: false //config.get('NODE_ENV', { infer: true }) === NodeEnv.DEVELOPMENT,
      }),
    }),
    AuthModule,
    UsersModule,
    BusinessModule,
    QueuesModule,
    ProductsModule,
    InventoryModule,
    ExpensesModule,
    DebtsModule,
    SalesModule,
    SyncModule,
    PermissionsModule,
    PlansModule,
    SubscriptionsModule,
    RedisModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, RequestLoggingMiddleware).forRoutes('*')
  }
}
