import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ExpenseCategoryRangeItem, ExpenseMonthlyRangeItem, ExpenseMonthlySummary } from '@biztrack/types'
import { EntityManager, Repository } from 'typeorm'
import { Expense } from '@/entities/expense.entity'
import { MonthlyExpenseSummary } from '@/entities/monthly-expense-summary.entity'

type MonthWindow = {
  start: Date
  endExclusive: Date
}

@Injectable()
export class MonthlyExpenseSummaryService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(MonthlyExpenseSummary)
    private readonly summariesRepo: Repository<MonthlyExpenseSummary>,
  ) { }

  async rebuildMonth(businessId: string, year: number, month: number, manager?: EntityManager) {
    const expenseRepo = manager?.getRepository(Expense) ?? this.expensesRepo
    const summaryRepo = manager?.getRepository(MonthlyExpenseSummary) ?? this.summariesRepo
    const window = this.getMonthWindow(year, month)

    const rows = await expenseRepo
      .createQueryBuilder('expense')
      .innerJoin('expense.category', 'category')
      .select('category.slug', 'slug')
      .addSelect('SUM(expense.amount)', 'amount')
      .addSelect('COUNT(expense.id)', 'count')
      .addSelect(
        'SUM(CASE WHEN expense.is_recurring = true THEN expense.amount ELSE 0 END)',
        'recurringAmount',
      )
      .where('expense.business_id = :businessId', { businessId })
      .andWhere('expense.deleted_at IS NULL')
      .andWhere('category.deleted_at IS NULL')
      .andWhere('expense.date >= :start', { start: window.start })
      .andWhere('expense.date < :endExclusive', { endExclusive: window.endExclusive })
      .groupBy('category.slug')
      .getRawMany<{
        slug: string
        amount: string | number | null
        count: string | number | null
        recurringAmount: string | number | null
      }>()

    const categoryBreakdown: Record<string, number> = {}
    let totalAmount = 0
    let expenseCount = 0
    let recurringAmount = 0

    for (const row of rows) {
      const amount = Number(row.amount ?? 0)
      const count = Number(row.count ?? 0)
      const recurring = Number(row.recurringAmount ?? 0)

      categoryBreakdown[row.slug] = this.roundMoney(amount)
      totalAmount += amount
      expenseCount += count
      recurringAmount += recurring
    }

    await summaryRepo.upsert(
      {
        businessId,
        summaryYear: year,
        summaryMonth: month,
        totalAmount: this.roundMoney(totalAmount),
        categoryBreakdown,
        expenseCount,
        recurringAmount: this.roundMoney(recurringAmount),
      } as any,
      ['businessId', 'summaryYear', 'summaryMonth'],
    )
  }

  async getMonthly(businessId: string, year: number, month: number): Promise<ExpenseMonthlySummary> {
    const summary = await this.summariesRepo.findOne({
      where: {
        businessId,
        summaryYear: year,
        summaryMonth: month,
      },
    })

    if (!summary) {
      return {
        year,
        month,
        totalAmount: 0,
        expenseCount: 0,
        recurringAmount: 0,
        oneOffAmount: 0,
        categoryBreakdown: {},
      }
    }

    return {
      year: summary.summaryYear,
      month: summary.summaryMonth,
      totalAmount: summary.totalAmount,
      expenseCount: summary.expenseCount,
      recurringAmount: summary.recurringAmount,
      oneOffAmount: this.roundMoney(summary.totalAmount - summary.recurringAmount),
      categoryBreakdown: summary.categoryBreakdown ?? {},
    }
  }

  async getRangeByMonth(
    businessId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<ExpenseMonthlyRangeItem[]> {
    const months = this.listMonths(dateFrom, dateTo)
    if (months.length === 0) {
      return []
    }

    const start = months[0]!
    const end = months[months.length - 1]!
    const summaries = await this.summariesRepo
      .createQueryBuilder('summary')
      .where('summary.business_id = :businessId', { businessId })
      .andWhere(
        '(summary.summary_year > :startYear OR (summary.summary_year = :startYear AND summary.summary_month >= :startMonth))',
        { startYear: start.year, startMonth: start.month },
      )
      .andWhere(
        '(summary.summary_year < :endYear OR (summary.summary_year = :endYear AND summary.summary_month <= :endMonth))',
        { endYear: end.year, endMonth: end.month },
      )
      .getMany()

    const byMonth = new Map(
      summaries.map((summary) => [
        `${summary.summaryYear}-${summary.summaryMonth}`,
        summary.totalAmount,
      ]),
    )

    return months.map((month) => ({
      year: month.year,
      month: month.month,
      totalAmount: this.roundMoney(byMonth.get(`${month.year}-${month.month}`) ?? 0),
    }))
  }

  async getRangeByCategory(
    businessId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<ExpenseCategoryRangeItem[]> {
    const { start, endExclusive } = this.getDateRangeWindow(dateFrom, dateTo)
    const rows = await this.expensesRepo
      .createQueryBuilder('expense')
      .innerJoin('expense.category', 'category')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'name')
      .addSelect('category.slug', 'slug')
      .addSelect('category.color', 'color')
      .addSelect('SUM(expense.amount)', 'totalAmount')
      .where('expense.business_id = :businessId', { businessId })
      .andWhere('expense.deleted_at IS NULL')
      .andWhere('category.deleted_at IS NULL')
      .andWhere('expense.date >= :start', { start })
      .andWhere('expense.date < :endExclusive', { endExclusive })
      .groupBy('category.id')
      .addGroupBy('category.name')
      .addGroupBy('category.slug')
      .addGroupBy('category.color')
      .orderBy('SUM(expense.amount)', 'DESC')
      .getRawMany<{
        categoryId: string
        name: string
        slug: string
        color: string
        totalAmount: string | number | null
      }>()

    const grandTotal = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0)

    return rows.map((row) => {
      const totalAmount = this.roundMoney(Number(row.totalAmount ?? 0))

      return {
        categoryId: row.categoryId,
        name: row.name,
        slug: row.slug,
        color: row.color,
        totalAmount,
        percentage:
          grandTotal > 0 ? Math.round((totalAmount / grandTotal) * 1000) / 10 : 0,
      }
    })
  }

  private listMonths(dateFrom: string, dateTo: string) {
    const start = this.parseDateOnly(dateFrom)
    const end = this.parseDateOnly(dateTo)
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
    const months: Array<{ year: number; month: number }> = []

    while (cursor <= last) {
      months.push({
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth() + 1,
      })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }

    return months
  }

  private getMonthWindow(year: number, month: number): MonthWindow {
    const start = new Date(Date.UTC(year, month - 1, 1))
    const endExclusive = new Date(Date.UTC(year, month, 1))
    return { start, endExclusive }
  }

  private getDateRangeWindow(dateFrom: string, dateTo: string) {
    const start = this.parseDateOnly(dateFrom)
    const endExclusive = this.parseDateOnly(dateTo)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    return { start, endExclusive }
  }

  private parseDateOnly(value: string) {
    return new Date(`${value}T00:00:00.000Z`)
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100
  }
}
