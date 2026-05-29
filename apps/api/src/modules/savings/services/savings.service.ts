import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type {
  SavingsAccountSyncPayload,
  SavingsTransactionSyncPayload,
} from '@biztrack/types'
import { Repository } from 'typeorm'
import { SavingsAccount } from '@/entities/savings-account.entity'
import { SavingsTransaction } from '@/entities/savings-transaction.entity'

@Injectable()
export class SavingsService {
  constructor(
    @InjectRepository(SavingsAccount)
    private readonly savingsAccountsRepo: Repository<SavingsAccount>,
    @InjectRepository(SavingsTransaction)
    private readonly savingsTransactionsRepo: Repository<SavingsTransaction>,
  ) {}

  async applySavingsAccountOperation(
    businessId: string,
    payload: SavingsAccountSyncPayload,
  ): Promise<void> {
    const existing = await this.savingsAccountsRepo.findOne({
      where: { id: payload.savingsId, businessId },
    })

    if (!existing) {
      await this.savingsAccountsRepo.save(
        this.savingsAccountsRepo.create({
          id: payload.savingsId,
          businessId,
          customerId: payload.customerId,
          customerName: payload.customerName ?? null,
          customerPhone: payload.customerPhone ?? null,
          accountNumber: payload.accountNumber,
          balance: payload.balance,
          totalDeposited: payload.totalDeposited,
          totalRefunded: payload.totalRefunded,
          totalUsed: payload.totalUsed,
          taggedProducts: payload.taggedProducts ?? null,
          isDeleted: false,
          createdAt: new Date(payload.createdAt),
          updatedAt: new Date(payload.updatedAt),
        }),
      )
    } else {
      await this.savingsAccountsRepo.update(existing.id, {
        balance: payload.balance,
        totalDeposited: payload.totalDeposited,
        totalRefunded: payload.totalRefunded,
        totalUsed: payload.totalUsed,
        taggedProducts: payload.taggedProducts ?? null,
        customerName: payload.customerName ?? null,
        customerPhone: payload.customerPhone ?? null,
        updatedAt: new Date(payload.updatedAt),
      })
    }
  }

  async applyTransactionOperation(
    businessId: string,
    payload: SavingsTransactionSyncPayload,
  ): Promise<void> {
    const existing = await this.savingsTransactionsRepo.findOne({
      where: { id: payload.transactionId, businessId },
    })

    if (existing) {
      return
    }

    await this.savingsTransactionsRepo.save(
      this.savingsTransactionsRepo.create({
        id: payload.transactionId,
        savingsId: payload.savingsId,
        businessId,
        type: payload.type,
        direction: payload.direction,
        amount: payload.amount,
        method: payload.method ?? null,
        mobileMoneyReference: payload.mobileMoneyReference ?? null,
        saleId: payload.saleId ?? null,
        notes: payload.notes ?? null,
        recordedById: payload.recordedById ?? null,
        occurredAt: new Date(payload.occurredAt),
        isDeleted: false,
        createdAt: new Date(payload.createdAt),
      }),
    )
    // Account balance is maintained by the savings account sync record which is pushed alongside every transaction
  }

  async createVoidedSaleTransaction(
    businessId: string,
    savingsAccountId: string,
    saleId: string,
    amount: number,
    voidedAt: Date,
  ): Promise<void> {
    const txId = crypto.randomUUID()
    await this.savingsTransactionsRepo.save(
      this.savingsTransactionsRepo.create({
        id: txId,
        savingsId: savingsAccountId,
        businessId,
        type: 'voided_sale',
        direction: 'inbound',
        amount,
        method: null,
        mobileMoneyReference: null,
        saleId,
        notes: null,
        recordedById: null,
        occurredAt: voidedAt,
        isDeleted: false,
        createdAt: voidedAt,
      }),
    )

    // Credit money back to the account
    await this.savingsAccountsRepo
      .createQueryBuilder()
      .update()
      .set({
        balance: () => `balance + ${amount}`,
        totalUsed: () => `GREATEST(total_used - ${amount}, 0)`,
        updatedAt: voidedAt,
      })
      .where('id = :id AND business_id = :businessId', { id: savingsAccountId, businessId })
      .execute()
  }

  async findByBusiness(
    businessId: string,
    cursor: Date,
    pulledAt: Date,
  ): Promise<{
    accounts: SavingsAccount[]
    transactions: SavingsTransaction[]
  }> {
    const [accounts, transactions] = await Promise.all([
      this.savingsAccountsRepo
        .createQueryBuilder('sa')
        .where('sa.business_id = :businessId', { businessId })
        .andWhere('sa.updated_at > :cursor', { cursor })
        .andWhere('sa.updated_at <= :pulledAt', { pulledAt })
        .orderBy('sa.updated_at', 'ASC')
        .getMany(),
      this.savingsTransactionsRepo
        .createQueryBuilder('st')
        .where('st.business_id = :businessId', { businessId })
        .andWhere('st.created_at > :cursor', { cursor })
        .andWhere('st.created_at <= :pulledAt', { pulledAt })
        .orderBy('st.created_at', 'ASC')
        .getMany(),
    ])

    return { accounts, transactions }
  }
}
