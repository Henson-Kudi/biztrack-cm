import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SavingsAccount } from '@/entities/savings-account.entity'
import { SavingsTransaction } from '@/entities/savings-transaction.entity'
import { SavingsController } from './controllers/savings.controller'
import { SavingsService } from './services/savings.service'

@Module({
  imports: [TypeOrmModule.forFeature([SavingsAccount, SavingsTransaction])],
  controllers: [SavingsController],
  providers: [SavingsService],
  exports: [SavingsService],
})
export class SavingsModule {}
