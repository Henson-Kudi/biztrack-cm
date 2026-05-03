import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { RedisModule } from '@/common/redis/redis.module'
import { RedisService } from '@/common/redis/redis.service'

@Global()
@Module({
  imports: [
    RedisModule,
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        connection: redis.getBullConnectionOptions(),
        defaultJobOptions: {
          removeOnComplete: 25,
          removeOnFail: 100,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
