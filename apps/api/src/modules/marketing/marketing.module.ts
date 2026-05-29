import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PassportModule } from '@nestjs/passport'
import { WaitlistEntry } from '@/entities/waitlist-entry.entity'
import { WaitlistService } from './waitlist/waitlist.service'
import { WaitlistController } from './waitlist/waitlist.controller'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@Module({
  imports: [
    TypeOrmModule.forFeature([WaitlistEntry]),
    NotificationsModule,
    PassportModule,
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService, JwtAuthGuard],
})
export class MarketingModule {}
