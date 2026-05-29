import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  BusinessMemberRole,
  ContactType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  ContactStatementEntryType,
  PaymentMethod,
  type ContactStatement,
  type Debt,
  type DebtDirectionSummary,
  type DebtListItem,
  type DebtListResult,
  type DebtsQuery,
  type JwtPayload,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { toIsoString } from '@/common/http/serialization'
import { Contact } from '@/entities/contact.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { Debt as DebtEntity } from '@/entities/debt.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import type { RecordDebtPaymentDto } from '../dto/record-debt-payment.dto'
import type { WriteOffDebtDto } from '../dto/write-off-debt.dto'
import { OpeningBalancesService } from './opening-balances.service'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

type DebtDetailEntity = DebtEntity & {
  contact?: Contact | null
  payments?: Array<DebtPayment & { recordedBy?: { id: string; name: string } | null }>
}

type CreateSourceDebtParams = {
  businessId: string
  contactId: string
  direction: DebtDirection
  sourceType: DebtSource
  sourceId: string
  sourceReference: string
  originalAmount: number
  dueDate?: string | null
  notes?: string | null
  createdAt?: Date | null
}

type ContactTypeRequirement = {
  direction: DebtDirection
  contact: Contact
}

@Injectable()
export class DebtsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DebtEntity)
    private readonly debtsRepo: Repository<DebtEntity>,
    @InjectRepository(DebtPayment)
    private readonly paymentsRepo: Repository<DebtPayment>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    private readonly openingBalancesService: OpeningBalancesService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('DebtsService')
  }

  async findAllByDirection(
    businessId: string,
    direction: DebtDirection,
    query: DebtsQuery,
  ): Promise<DebtListResult> {
    try {
      await this.assertValidDateRange(query.dateFrom, query.dateTo)
      const qb = this.buildListQuery(businessId, query, { direction })
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit
      const sort = this.resolveSortField(query.sortBy)
      const sortOrder = query.sortOrder ?? 'DESC'
      const [rows, total] = await qb
        .orderBy(sort, sortOrder)
        .addOrderBy('debt.created_at', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount()

      return {
        data: await this.mapDebtList(rows),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAllByDirection', error, { businessId, direction })
    }
  }

  async findAllForContact(
    contactId: string,
    businessId: string,
    query: DebtsQuery,
  ): Promise<DebtListResult> {
    try {
      await this.assertValidDateRange(query.dateFrom, query.dateTo)
      await this.requireContact(contactId, businessId)
      const qb = this.buildListQuery(businessId, query, { contactId })
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit
      const sort = this.resolveSortField(query.sortBy)
      const sortOrder = query.sortOrder ?? 'DESC'
      const [rows, total] = await qb
        .orderBy(sort, sortOrder)
        .addOrderBy('debt.created_at', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount()

      return {
        data: await this.mapDebtList(rows),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAllForContact', error, { contactId, businessId })
    }
  }

  async getSummary(businessId: string, direction: DebtDirection): Promise<DebtDirectionSummary> {
    try {
      const debts = await this.debtsRepo.find({
        where: { businessId, direction },
      })
      const paidAmounts = await this.loadPaidAmounts(debts.map((debt) => debt.id))
      const monthStart = new Date()
      monthStart.setUTCDate(1)
      monthStart.setUTCHours(0, 0, 0, 0)
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))

      let totalOutstanding = 0
      let outstandingDebtCount = 0
      let partiallyPaidDebtCount = 0
      let partiallyPaidOutstanding = 0
      let settledThisMonthCount = 0
      let settledThisMonthAmount = 0

      for (const debt of debts) {
        const paidAmount = paidAmounts.get(debt.id) ?? 0
        const rawOutstanding = this.computeRawOutstanding(debt.originalAmount, paidAmount)

        if ([DebtStatus.OUTSTANDING, DebtStatus.PARTIALLY_PAID].includes(debt.status) && rawOutstanding > 0) {
          totalOutstanding = this.roundMoney(totalOutstanding + rawOutstanding)
          outstandingDebtCount += 1
        }

        if (debt.status === DebtStatus.PARTIALLY_PAID && rawOutstanding > 0) {
          partiallyPaidDebtCount += 1
          partiallyPaidOutstanding = this.roundMoney(partiallyPaidOutstanding + rawOutstanding)
        }

        if (
          debt.status === DebtStatus.SETTLED &&
          debt.settledAt &&
          debt.settledAt >= monthStart &&
          debt.settledAt < monthEnd
        ) {
          settledThisMonthCount += 1
          settledThisMonthAmount = this.roundMoney(settledThisMonthAmount + debt.originalAmount)
        }
      }

      return {
        direction,
        totalOutstanding,
        outstandingDebtCount,
        partiallyPaidDebtCount,
        partiallyPaidOutstanding,
        settledThisMonthCount,
        settledThisMonthAmount,
      }
    } catch (error) {
      return this.handleServiceError('getSummary', error, { businessId, direction })
    }
  }

  async findById(
    debtId: string,
    businessId: string,
    direction?: DebtDirection,
  ): Promise<Debt> {
    try {
      const debt = await this.findDebtWithRelations(debtId, businessId, direction)
      return this.toDebtModel(debt)
    } catch (error) {
      return this.handleServiceError('findById', error, { debtId, businessId, direction })
    }
  }

  async recordPayment(
    businessId: string,
    user: JwtPayload,
    direction: DebtDirection,
    debtId: string,
    dto: RecordDebtPaymentDto,
  ): Promise<Debt> {
    try {
      this.assertDateOnly(dto.paymentDate)

      await this.dataSource.transaction(async (manager) => {
        const debtRepo = manager.getRepository(DebtEntity)
        const paymentRepo = manager.getRepository(DebtPayment)
        const debt = await debtRepo.findOne({
          where: { id: debtId, businessId, direction },
        })

        if (!debt) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.debt_not_found' as never),
            'DEBT_NOT_FOUND',
          )
        }

        if ([DebtStatus.SETTLED, DebtStatus.WRITTEN_OFF].includes(debt.status)) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.debt_payment_locked' as never),
            'DEBT_PAYMENT_LOCKED',
          )
        }

        const outstandingAmount = await this.computeOutstandingAmount(debt.id, manager, debt.originalAmount)
        const amount = this.roundMoney(dto.amount)

        if (amount <= 0 || amount > outstandingAmount) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.debt_payment_amount_exceeds_outstanding' as never),
            'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING',
            { amount, outstandingAmount },
          )
        }

        const debtCreatedDate = this.toDateOnly(debt.createdAt)
        if (dto.paymentDate < debtCreatedDate) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.debt_payment_date_invalid' as never),
            'DEBT_PAYMENT_DATE_INVALID',
            { debtCreatedDate },
          )
        }

        await paymentRepo.save(
          paymentRepo.create({
            businessId,
            debtId,
            amount,
            method: dto.method,
            mobileMoneyReference: this.normalizeOptionalString(dto.mobileMoneyReference),
            paymentDate: dto.paymentDate,
            notes: this.normalizeOptionalString(dto.notes),
            recordedById: user.sub,
          }),
        )

        await this.recalculateStatus(debt.id, manager)
      })

      return this.findById(debtId, businessId, direction)
    } catch (error) {
      return this.handleServiceError('recordPayment', error, {
        debtId,
        businessId,
        direction,
        userId: user.sub,
      })
    }
  }

  async deletePayment(
    businessId: string,
    user: JwtPayload,
    direction: DebtDirection,
    debtId: string,
    paymentId: string,
  ): Promise<void> {
    try {
      await this.assertOwnerOrManager(user, 'errors.debt_payment_forbidden', 'DEBT_PAYMENT_FORBIDDEN')

      await this.dataSource.transaction(async (manager) => {
        const debtRepo = manager.getRepository(DebtEntity)
        const paymentRepo = manager.getRepository(DebtPayment)
        const debt = await debtRepo.findOne({
          where: { id: debtId, businessId, direction },
        })

        if (!debt) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.debt_not_found' as never),
            'DEBT_NOT_FOUND',
          )
        }

        const payment = await paymentRepo.findOne({
          where: { id: paymentId, debtId, businessId },
        })

        if (!payment) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.debt_payment_not_found' as never),
            'DEBT_PAYMENT_NOT_FOUND',
          )
        }

        await paymentRepo.delete(payment.id)

        if (debt.status !== DebtStatus.WRITTEN_OFF) {
          await this.recalculateStatus(debt.id, manager)
        } else {
          await debtRepo.update(debt.id, {
            updatedAt: new Date(),
          })
        }
      })
    } catch (error) {
      return this.handleServiceError('deletePayment', error, {
        debtId,
        paymentId,
        businessId,
        direction,
        userId: user.sub,
      })
    }
  }

  async writeOff(
    businessId: string,
    user: JwtPayload,
    direction: DebtDirection,
    debtId: string,
    dto: WriteOffDebtDto,
  ): Promise<Debt> {
    try {
      await this.assertOwnerOrManager(user, 'errors.debt_write_off_forbidden', 'DEBT_WRITE_OFF_FORBIDDEN')

      await this.dataSource.transaction(async (manager) => {
        const debtRepo = manager.getRepository(DebtEntity)
        const debt = await debtRepo.findOne({
          where: { id: debtId, businessId, direction },
        })

        if (!debt) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.debt_not_found' as never),
            'DEBT_NOT_FOUND',
          )
        }

        if (debt.status === DebtStatus.WRITTEN_OFF) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.debt_already_written_off' as never),
            'DEBT_ALREADY_WRITTEN_OFF',
          )
        }

        if (debt.status === DebtStatus.SETTLED) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.debt_already_settled' as never),
            'DEBT_ALREADY_SETTLED',
          )
        }

        await debtRepo.update(debt.id, {
          status: DebtStatus.WRITTEN_OFF,
          settledAt: null,
          writtenOffAt: new Date(),
          writtenOffById: user.sub,
          writtenOffReason: dto.reason.trim(),
          updatedAt: new Date(),
        })
      })

      return this.findById(debtId, businessId, direction)
    } catch (error) {
      return this.handleServiceError('writeOff', error, {
        debtId,
        businessId,
        direction,
        userId: user.sub,
      })
    }
  }

  async buildContactStatement(
    contactId: string,
    businessId: string,
    requestedDirection?: DebtDirection,
  ): Promise<ContactStatement> {
    try {
      const contact = await this.requireContact(contactId, businessId)
      const directionsRaw = await this.debtsRepo
        .createQueryBuilder('debt')
        .select('DISTINCT debt.direction', 'direction')
        .where('debt.business_id = :businessId', { businessId })
        .andWhere('debt.contact_id = :contactId', { contactId })
        .getRawMany<{ direction: DebtDirection }>()

      const directions = directionsRaw.map((row) => row.direction)
      let direction = requestedDirection

      if (!direction) {
        if (directions.length <= 1) {
          direction = directions[0] ?? DebtDirection.RECEIVABLE
        } else {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.contact_statement_direction_required' as never),
            'CONTACT_STATEMENT_DIRECTION_REQUIRED',
          )
        }
      }

      const [debts, openingBalance] = await Promise.all([
        this.debtsRepo
          .createQueryBuilder('debt')
          .leftJoinAndSelect('debt.payments', 'payment')
          .where('debt.business_id = :businessId', { businessId })
          .andWhere('debt.contact_id = :contactId', { contactId })
          .andWhere('debt.direction = :direction', { direction })
          .orderBy('debt.created_at', 'ASC')
          .addOrderBy('payment.payment_date', 'ASC')
          .getMany(),
        this.openingBalancesService.findForContactAndDirection(contactId, businessId, direction),
      ])

      const events: Array<{
        sortAt: number
        date: string
        type: ContactStatementEntryType
        reference: string | null
        description: string
        debit: number
        credit: number
      }> = []

      if (openingBalance) {
        events.push({
          sortAt: Date.parse(`${openingBalance.asOfDate}T00:00:00.000Z`) - 1,
          date: openingBalance.asOfDate,
          type: ContactStatementEntryType.OPENING_BALANCE,
          reference: null,
          description: 'Opening balance',
          debit: openingBalance.amount,
          credit: 0,
        })
      }

      for (const debt of debts) {
        events.push({
          sortAt: debt.createdAt.getTime(),
          date: this.toDateOnly(debt.createdAt),
          type: ContactStatementEntryType.DEBT_CREATED,
          reference: debt.sourceReference ?? null,
          description: debt.sourceType === DebtSource.SALE ? 'Sale on credit' : 'Restock on credit',
          debit: debt.originalAmount,
          credit: 0,
        })

        const sortedPayments = [...(debt.payments ?? [])].sort((a, b) => {
          const dateCompare = a.paymentDate.localeCompare(b.paymentDate)
          if (dateCompare !== 0) return dateCompare
          return a.createdAt.getTime() - b.createdAt.getTime()
        })

        for (const payment of sortedPayments) {
          events.push({
            sortAt: Date.parse(`${payment.paymentDate}T12:00:00.000Z`),
            date: payment.paymentDate,
            type: ContactStatementEntryType.PAYMENT,
            reference: null,
            description: `${this.getPaymentMethodLabel(payment.method)} payment`,
            debit: 0,
            credit: payment.amount,
          })
        }

        if (debt.status === DebtStatus.WRITTEN_OFF && debt.writtenOffAt) {
          const totalPaid = this.roundMoney(
            (debt.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0),
          )
          const remaining = this.computeRawOutstanding(debt.originalAmount, totalPaid)
          if (remaining > 0) {
            events.push({
              sortAt: debt.writtenOffAt.getTime(),
              date: this.toDateOnly(debt.writtenOffAt),
              type: ContactStatementEntryType.WRITE_OFF,
              reference: debt.sourceReference ?? null,
              description: 'Debt written off',
              debit: 0,
              credit: remaining,
            })
          }
        }
      }

      events.sort((left, right) => left.sortAt - right.sortAt)

      let balance = 0
      const entries = events.map((event) => {
        balance = this.roundMoney(balance + event.debit - event.credit)
        return {
          date: event.date,
          type: event.type,
          direction,
          reference: event.reference,
          description: event.description,
          debit: event.debit,
          credit: event.credit,
          balance,
        }
      })

      return {
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone ?? null,
        },
        direction,
        openingBalance: openingBalance?.amount ?? 0,
        entries,
        closingBalance: balance,
      }
    } catch (error) {
      return this.handleServiceError('buildContactStatement', error, {
        contactId,
        businessId,
        requestedDirection,
      })
    }
  }

  async requireContact(contactId: string, businessId: string): Promise<Contact> {
    const contact = await this.contactsRepo.findOne({
      where: { id: contactId, businessId },
    })

    if (!contact) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.contact_not_found' as never),
        'CONTACT_NOT_FOUND',
      )
    }

    return contact
  }

  async requireCreditContact(
    contactId: string,
    businessId: string,
    direction: DebtDirection,
    manager?: EntityManager,
  ): Promise<Contact> {
    const contactRepo = manager?.getRepository(Contact) ?? this.contactsRepo
    const contact = await contactRepo.findOne({
      where: { id: contactId, businessId },
    })

    if (!contact) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.contact_not_found' as never),
        'CONTACT_NOT_FOUND',
      )
    }

    if (!contact.isActive) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.contact_inactive' as never),
        'CONTACT_INACTIVE',
        { contactId },
      )
    }

    const requirement = this.resolveRequiredContactType({ direction, contact })
    if (!this.matchesRequiredContactType(contact.type as ContactType, requirement.direction)) {
      throw new AppBadRequestException(
        await this.i18n.translate(
          requirement.direction === DebtDirection.RECEIVABLE
            ? ('errors.customer_contact_required_for_credit' as never)
            : ('errors.supplier_contact_required_for_credit' as never),
        ),
        requirement.direction === DebtDirection.RECEIVABLE
          ? 'CUSTOMER_CONTACT_REQUIRED_FOR_CREDIT'
          : 'SUPPLIER_CONTACT_REQUIRED_FOR_CREDIT',
        {
          contactId,
          contactType: contact.type,
        },
      )
    }

    return contact
  }

  async createSourceDebt(
    manager: EntityManager,
    params: CreateSourceDebtParams,
  ): Promise<DebtEntity | null> {
    const originalAmount = this.roundMoney(params.originalAmount)
    const sourceReference = this.normalizeOptionalString(params.sourceReference) ?? params.sourceId
    if (originalAmount <= 0) {
      return null
    }

    await this.requireCreditContact(params.contactId, params.businessId, params.direction, manager)

    const debtRepo = manager.getRepository(DebtEntity)
    const existing = await debtRepo.findOne({
      where: {
        businessId: params.businessId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        direction: params.direction,
      },
    })

    if (existing) {
      return existing
    }

    return debtRepo.save(
      debtRepo.create({
        businessId: params.businessId,
        contactId: params.contactId,
        direction: params.direction,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        sourceReference,
        originalAmount,
        status: DebtStatus.OUTSTANDING,
        dueDate: params.dueDate ?? null,
        notes: this.normalizeOptionalString(params.notes),
        createdAt: params.createdAt ?? new Date(),
        updatedAt: params.createdAt ?? new Date(),
      }),
    )
  }

  async writeOffSourceDebt(
    manager: EntityManager,
    params: {
      businessId: string
      sourceType: DebtSource
      sourceId: string
      reason: string
      writtenOffAt?: Date | null
      writtenOffById?: string | null
    },
  ): Promise<void> {
    const debtRepo = manager.getRepository(DebtEntity)
    const debts = await debtRepo.find({
      where: {
        businessId: params.businessId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      },
    })

    if (debts.length === 0) {
      return
    }

    const writtenOffAt = params.writtenOffAt ?? new Date()
    const writtenOffReason = this.normalizeOptionalString(params.reason) ?? 'Written off'

    for (const debt of debts) {
      if ([DebtStatus.SETTLED, DebtStatus.WRITTEN_OFF].includes(debt.status)) {
        continue
      }

      await debtRepo.update(debt.id, {
        status: DebtStatus.WRITTEN_OFF,
        settledAt: null,
        writtenOffAt,
        writtenOffById: params.writtenOffById ?? null,
        writtenOffReason,
        updatedAt: writtenOffAt,
      })
    }
  }

  private buildListQuery(
    businessId: string,
    query: DebtsQuery,
    filters: { direction?: DebtDirection; contactId?: string },
  ) {
    const qb = this.debtsRepo
      .createQueryBuilder('debt')
      .leftJoinAndSelect('debt.contact', 'contact')
      .where('debt.business_id = :businessId', { businessId })

    if (filters.direction) {
      qb.andWhere('debt.direction = :direction', { direction: filters.direction })
    }

    if (filters.contactId) {
      qb.andWhere('debt.contact_id = :contactId', { contactId: filters.contactId })
    }

    if (query.contactId) {
      qb.andWhere('debt.contact_id = :queryContactId', { queryContactId: query.contactId })
    }

    if (query.status) {
      qb.andWhere('debt.status = :status', { status: query.status })
    }

    if (query.dateFrom) {
      qb.andWhere('debt.created_at::date >= :dateFrom', { dateFrom: query.dateFrom })
    }

    if (query.dateTo) {
      qb.andWhere('debt.created_at::date <= :dateTo', { dateTo: query.dateTo })
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`
      qb.andWhere(
        new Brackets((builder) => {
          builder
            .where('LOWER(debt.source_reference) LIKE :search', { search })
            .orWhere('LOWER(contact.name) LIKE :search', { search })
            .orWhere('LOWER(COALESCE(contact.phone, \'\')) LIKE :search', { search })
        }),
      )
    }

    return qb
  }

  private resolveSortField(field?: string) {
    const sortMap: Record<string, string> = {
      createdAt: 'debt.created_at',
      dueDate: 'debt.due_date',
      originalAmount: 'debt.original_amount',
      sourceReference: 'debt.source_reference',
      status: 'debt.status',
      contactName: 'contact.name',
    }

    return sortMap[field ?? ''] ?? 'debt.created_at'
  }

  private async mapDebtList(rows: DebtEntity[]): Promise<DebtListItem[]> {
    const paidAmounts = await this.loadPaidAmounts(rows.map((row) => row.id))
    return rows.map((row) => this.toDebtModel(row, paidAmounts.get(row.id) ?? 0))
  }

  private async findDebtWithRelations(
    debtId: string,
    businessId: string,
    direction?: DebtDirection,
  ): Promise<DebtDetailEntity> {
    const qb = this.debtsRepo
      .createQueryBuilder('debt')
      .leftJoinAndSelect('debt.contact', 'contact')
      .leftJoinAndSelect('debt.payments', 'payment')
      .leftJoinAndSelect('payment.recordedBy', 'paymentRecordedBy')
      .where('debt.id = :debtId', { debtId })
      .andWhere('debt.business_id = :businessId', { businessId })

    if (direction) {
      qb.andWhere('debt.direction = :direction', { direction })
    }

    const debt = await qb
      .orderBy('payment.payment_date', 'ASC')
      .addOrderBy('payment.created_at', 'ASC')
      .getOne()

    if (!debt) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.debt_not_found' as never),
        'DEBT_NOT_FOUND',
      )
    }

    return debt as DebtDetailEntity
  }

  private async loadPaidAmounts(debtIds: string[]): Promise<Map<string, number>> {
    if (debtIds.length === 0) return new Map()

    const rows = await this.paymentsRepo
      .createQueryBuilder('payment')
      .select('payment.debt_id', 'debtId')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'paidAmount')
      .where('payment.debt_id IN (:...debtIds)', { debtIds })
      .groupBy('payment.debt_id')
      .getRawMany<{ debtId: string; paidAmount: string | number }>()

    return new Map(
      rows.map((row) => [row.debtId, this.roundMoney(Number(row.paidAmount ?? 0))]),
    )
  }

  private toDebtModel(entity: DebtDetailEntity | DebtEntity, paidAmountOverride?: number): Debt {
    const payments = [...(entity.payments ?? [])].sort((left, right) => {
      const dateCompare = left.paymentDate.localeCompare(right.paymentDate)
      if (dateCompare !== 0) return dateCompare
      return left.createdAt.getTime() - right.createdAt.getTime()
    })
    const paidAmount =
      paidAmountOverride ??
      this.roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0))
    const rawOutstanding = this.computeRawOutstanding(entity.originalAmount, paidAmount)
    const outstandingAmount = entity.status === DebtStatus.WRITTEN_OFF ? 0 : rawOutstanding

    return {
      id: entity.id,
      businessId: entity.businessId,
      contactId: entity.contactId,
      contact: entity.contact
        ? {
            id: entity.contact.id,
            type: entity.contact.type as ContactType,
            name: entity.contact.name,
            phone: entity.contact.phone ?? null,
          }
        : null,
      direction: entity.direction,
      sourceType: entity.sourceType,
      sourceId: entity.sourceId,
      sourceReference: entity.sourceReference,
      originalAmount: entity.originalAmount,
      paidAmount,
      outstandingAmount,
      status: entity.status,
      dueDate: entity.dueDate ?? null,
      notes: entity.notes ?? null,
      createdAt: toIsoString(entity.createdAt) ?? '',
      settledAt: toIsoString(entity.settledAt) ?? null,
      writtenOffAt: toIsoString(entity.writtenOffAt) ?? null,
      writtenOffById: entity.writtenOffById ?? null,
      writtenOffReason: entity.writtenOffReason ?? null,
      payments: payments.map((payment) => ({
        id: payment.id,
        businessId: payment.businessId,
        debtId: payment.debtId,
        amount: payment.amount,
        method: payment.method,
        mobileMoneyReference: payment.mobileMoneyReference ?? null,
        paymentDate: payment.paymentDate,
        notes: payment.notes ?? null,
        recordedById: payment.recordedById,
        recordedBy: payment.recordedBy
          ? {
              id: payment.recordedBy.id,
              name: payment.recordedBy.name,
            }
          : null,
        createdAt: toIsoString(payment.createdAt) ?? '',
      })),
    }
  }

  private async computeOutstandingAmount(
    debtId: string,
    manager: EntityManager,
    originalAmount: number,
  ) {
    const totalPaidRow = await manager
      .getRepository(DebtPayment)
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'paidAmount')
      .where('payment.debt_id = :debtId', { debtId })
      .getRawOne<{ paidAmount: string | number | null }>()

    return this.computeRawOutstanding(originalAmount, Number(totalPaidRow?.paidAmount ?? 0))
  }

  private async recalculateStatus(debtId: string, manager: EntityManager) {
    const debtRepo = manager.getRepository(DebtEntity)
    const debt = await debtRepo.findOne({ where: { id: debtId } })

    if (!debt || debt.status === DebtStatus.WRITTEN_OFF) return

    const outstandingAmount = await this.computeOutstandingAmount(debtId, manager, debt.originalAmount)
    const totalPaid = this.roundMoney(debt.originalAmount - outstandingAmount)
    let status = DebtStatus.OUTSTANDING

    if (outstandingAmount <= 0) {
      status = DebtStatus.SETTLED
    } else if (totalPaid > 0) {
      status = DebtStatus.PARTIALLY_PAID
    }

    await debtRepo.update(debtId, {
      status,
      settledAt: status === DebtStatus.SETTLED ? new Date() : null,
      updatedAt: new Date(),
    })
  }

  private getPaymentMethodLabel(method: PaymentMethod) {
    switch (method) {
      case PaymentMethod.MTN_MOMO:
        return 'MTN MoMo'
      case PaymentMethod.ORANGE_MONEY:
        return 'Orange Money'
      case PaymentMethod.CARD:
        return 'Card'
      default:
        return 'Cash'
    }
  }

  private computeRawOutstanding(originalAmount: number, paidAmount: number) {
    return this.roundMoney(Math.max(0, originalAmount - paidAmount))
  }

  private resolveRequiredContactType({ direction, contact }: ContactTypeRequirement) {
    return {
      direction,
      contact,
    }
  }

  private matchesRequiredContactType(type: ContactType, direction: DebtDirection) {
    if (direction === DebtDirection.RECEIVABLE) {
      return type === ContactType.CUSTOMER || type === ContactType.BOTH
    }

    return type === ContactType.SUPPLIER || type === ContactType.BOTH
  }

  private toDateOnly(value: Date | string) {
    if (typeof value === 'string') return value.slice(0, 10)
    return value.toISOString().slice(0, 10)
  }

  private normalizeOptionalString(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  private roundMoney(value: number) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
  }

  private assertDateOnly(value: string) {
    if (!DATE_ONLY_REGEX.test(value)) {
      throw new AppBadRequestException(
        'Invalid date.',
        'INVALID_DATE',
      )
    }
  }

  private async assertValidDateRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom || !dateTo) return
    if (dateFrom > dateTo) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.invalid_date_range' as never),
        'INVALID_DATE_RANGE',
      )
    }
  }

  private async assertOwnerOrManager(
    user: JwtPayload,
    translationKey: string,
    code: string,
  ) {
    if (![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(user.role as BusinessMemberRole)) {
      throw new AppForbiddenException(
        await this.i18n.translate(translationKey as never),
        code,
      )
    }
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('DebtsService error', 'DebtsService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('DebtsService unexpected error', 'DebtsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error' as never),
      'DEBTS_SERVICE_ERROR',
      { action },
    )
  }
}
