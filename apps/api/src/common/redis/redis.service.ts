import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import type { RedisOptions } from 'ioredis'
import type { AppConfig } from '@/config/configuration'
import { type Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client?: Redis
  private redisUrl: string | undefined

  constructor(private config: ConfigService<AppConfig>, @Inject(LOGGER) private logger: Logger) {
    const url = this.config.get('REDIS_URL', { infer: true })

    if (!url) {
      logger.warn('REDIS_URL is not configured. RedisService will not be available.')
    }

    this.redisUrl = url
  }

  onModuleInit() {
    if (!this.redisUrl) {
      this.logger.warn('REDIS_URL is not configured. RedisService will not be initialized.')
      return
    }
    this.client = this.createClient('module_init')
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect()
    }
  }

  async incr(key: string): Promise<number> {
    return this.getClient().incr(key)
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.getClient().expire(key, seconds)
  }

  async ttl(key: string): Promise<number> {
    return this.getClient().ttl(key)
  }

  async get(key: string): Promise<string | null> {
    return this.getClient().get(key)
  }

  async set(key: string, value: string): Promise<void> {
    await this.getClient().set(key, value)
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    await this.getClient().setex(key, seconds, value)
  }

  async del(key: string): Promise<number> {
    return this.getClient().del(key)
  }

  getBullConnectionOptions(): RedisOptions {
    return {
      ...this.getClientOptions(),
      maxRetriesPerRequest: null,
    }
  }

  getConnectionState() {
    return {
      configured: Boolean(this.redisUrl),
      status: this.client?.status ?? 'idle',
    }
  }

  private getClient(): Redis {
    if (!this.client) {
      this.client = this.createClient('lazy_client')
    }
    return this.client
  }

  private createClient(source: 'module_init' | 'lazy_client'): Redis {
    const client = new Redis(this.getClientOptions())

    client.on('connect', () => {
      this.logger.log('Redis socket connected', 'RedisService', {
        source,
        status: client.status,
      })
    })

    client.on('ready', () => {
      this.logger.log('Redis client ready', 'RedisService', {
        source,
        status: client.status,
      })
    })

    client.on('reconnecting', () => {
      this.logger.warn('Redis client reconnecting', 'RedisService', {
        source,
        status: client.status,
      })
    })

    client.on('end', () => {
      this.logger.warn('Redis connection ended', 'RedisService', {
        source,
        status: client.status,
      })
    })

    client.on('error', (error) => {
      this.logger.error('Redis client error', 'RedisService', {
        source,
        status: client.status,
        message: error.message,
      })
    })

    return client
  }

  private getClientOptions(): RedisOptions {
    const redisUrl = this.getRedisUrl()
    const parsed = new URL(redisUrl)
    const database = parsed.pathname.replace(/^\//, '')

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: database ? Number(database) : undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    }
  }

  private getRedisUrl(): string {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL is not configured. Cannot create Redis client.')
    }

    return this.redisUrl
  }
}
