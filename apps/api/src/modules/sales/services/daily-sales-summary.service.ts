import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PaymentMethod } from '@biztrack/types'
import { Repository, EntityManager } from 'typeorm'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { Sale } from '@/entities/sale.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'

type PaymentBreakdown = {
  cashCollected: number
  mtnMomoCollected: number
  orangeMoneyCollected: number
  cardCollected: number
}

@Injectable()
export class DailySalesSummaryService {
  constructor(
    @InjectRepository(DailySaleSummary)
    private readonly summariesRepo: Repository<DailySaleSummary>,
  ) {}

  async findByDate(businessId: string, date: string) {
    return this.summariesRepo.findOne({
      where: {
        businessId,
        summaryDate: date,
      },
    })
  }

  async incrementForSale(
    sale: Sale,
    items: SaleItem[],
    payments: SalePayment[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(DailySaleSummary) ?? this.summariesRepo
    const totals = this.computeTotals(sale, items, payments)

    await repo.query(
      `
        INSERT INTO daily_sale_summaries (
          business_id,
          summary_date,
          total_sales,
          total_revenue,
          total_cost,
          gross_profit,
          total_discounts,
          cash_collected,
          mtn_momo_collected,
          orange_money_collected,
          card_collected,
          voided_sales,
          voided_amount,
          updated_at
        )
        VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, now())
        ON CONFLICT (business_id, summary_date)
        DO UPDATE SET
          total_sales = daily_sale_summaries.total_sales + 1,
          total_revenue = daily_sale_summaries.total_revenue + $3,
          total_cost = daily_sale_summaries.total_cost + $4,
          gross_profit = daily_sale_summaries.gross_profit + $5,
          total_discounts = daily_sale_summaries.total_discounts + $6,
          cash_collected = daily_sale_summaries.cash_collected + $7,
          mtn_momo_collected = daily_sale_summaries.mtn_momo_collected + $8,
          orange_money_collected = daily_sale_summaries.orange_money_collected + $9,
          card_collected = daily_sale_summaries.card_collected + $10,
          updated_at = now()
      `,
      [
        sale.businessId,
        sale.saleDate,
        sale.totalAmount,
        totals.totalCost,
        totals.grossProfit,
        totals.totalDiscounts,
        totals.cashCollected,
        totals.mtnMomoCollected,
        totals.orangeMoneyCollected,
        totals.cardCollected,
      ],
    )
  }

  async decrementForVoid(
    sale: Sale,
    items: SaleItem[],
    payments: SalePayment[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(DailySaleSummary) ?? this.summariesRepo
    const totals = this.computeTotals(sale, items, payments)

    await repo.query(
      `
        INSERT INTO daily_sale_summaries (
          business_id,
          summary_date,
          total_sales,
          total_revenue,
          total_cost,
          gross_profit,
          total_discounts,
          cash_collected,
          mtn_momo_collected,
          orange_money_collected,
          card_collected,
          voided_sales,
          voided_amount,
          updated_at
        )
        VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, $3, now())
        ON CONFLICT (business_id, summary_date)
        DO UPDATE SET
          total_sales = GREATEST(daily_sale_summaries.total_sales - 1, 0),
          total_revenue = GREATEST(daily_sale_summaries.total_revenue - $3, 0),
          total_cost = GREATEST(daily_sale_summaries.total_cost - $4, 0),
          gross_profit = daily_sale_summaries.gross_profit - $5,
          total_discounts = GREATEST(daily_sale_summaries.total_discounts - $6, 0),
          cash_collected = GREATEST(daily_sale_summaries.cash_collected - $7, 0),
          mtn_momo_collected = GREATEST(daily_sale_summaries.mtn_momo_collected - $8, 0),
          orange_money_collected = GREATEST(daily_sale_summaries.orange_money_collected - $9, 0),
          card_collected = GREATEST(daily_sale_summaries.card_collected - $10, 0),
          voided_sales = daily_sale_summaries.voided_sales + 1,
          voided_amount = daily_sale_summaries.voided_amount + $3,
          updated_at = now()
      `,
      [
        sale.businessId,
        sale.saleDate,
        sale.totalAmount,
        totals.totalCost,
        totals.grossProfit,
        totals.totalDiscounts,
        totals.cashCollected,
        totals.mtnMomoCollected,
        totals.orangeMoneyCollected,
        totals.cardCollected,
      ],
    )
  }

  private computeTotals(sale: Sale, items: SaleItem[], payments: SalePayment[]) {
    const totalCost = this.roundMoney(
      items.reduce((sum, item) => sum + (item.costPrice ?? 0) * item.quantity, 0),
    )
    const lineDiscounts = this.roundMoney(
      items.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0),
    )
    const breakdown = this.computePaymentBreakdown(payments)

    return {
      totalCost,
      grossProfit: this.roundMoney(sale.totalAmount - totalCost),
      totalDiscounts: this.roundMoney(sale.discountAmount + lineDiscounts),
      ...breakdown,
    }
  }

  private computePaymentBreakdown(payments: SalePayment[]): PaymentBreakdown {
    const totals: PaymentBreakdown = {
      cashCollected: 0,
      mtnMomoCollected: 0,
      orangeMoneyCollected: 0,
      cardCollected: 0,
    }

    for (const payment of payments) {
      if (payment.method === PaymentMethod.CASH) {
        totals.cashCollected = this.roundMoney(totals.cashCollected + payment.amount)
      } else if (payment.method === PaymentMethod.MTN_MOMO) {
        totals.mtnMomoCollected = this.roundMoney(totals.mtnMomoCollected + payment.amount)
      } else if (payment.method === PaymentMethod.ORANGE_MONEY) {
        totals.orangeMoneyCollected = this.roundMoney(totals.orangeMoneyCollected + payment.amount)
      } else if (payment.method === PaymentMethod.CARD) {
        totals.cardCollected = this.roundMoney(totals.cardCollected + payment.amount)
      }
    }

    return totals
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100
  }
}
