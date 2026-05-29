import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  ContactType,
  DebtDirection,
  DebtStatus,
  type AgeingEntry,
  type AgeingReport,
  type ContactNetPosition,
  type ContactOpeningBalance,
  type JwtPayload,
  type UpsertOpeningBalanceRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { In, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { toIsoString } from '@/common/http/serialization'
import { ContactOpeningBalance as ContactOpeningBalanceEntity } from '@/entities/contact-opening-balance.entity'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

@Injectable()
export class OpeningBalancesService {
  constructor(
    @InjectRepository(ContactOpeningBalanceEntity)
    private readonly openingBalancesRepo: Repository<ContactOpeningBalanceEntity>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Debt)
    private readonly debtsRepo: Repository<Debt>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('OpeningBalancesService')
  }

  async upsert(
    contactId: string,
    businessId: string,
    dto: UpsertOpeningBalanceRequest,
    user: JwtPayload,
  ): Promise<ContactOpeningBalance> {
    try {
      const contact = await this.requireContact(contactId, businessId)
      this.assertDirectionCompatibleWithType(contact.type as ContactType, dto.direction)
      this.assertDateOnly(dto.asOfDate)

      const amount = this.roundMoney(dto.amount)
      if (amount <= 0) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.opening_balance_amount_invalid' as never),
          'OPENING_BALANCE_AMOUNT_INVALID',
        )
      }

      const existing = await this.openingBalancesRepo.findOne({
        where: { businessId, contactId, direction: dto.direction },
      })

      if (existing) {
        await this.openingBalancesRepo.update(existing.id, {
          amount,
          asOfDate: dto.asOfDate,
          notes: dto.notes?.trim() || null,
          recordedById: user.sub,
          updatedAt: new Date(),
        })
        const updated = await this.openingBalancesRepo.findOneOrFail({ where: { id: existing.id } })
        return this.toModel(updated)
      }

      const created = await this.openingBalancesRepo.save(
        this.openingBalancesRepo.create({
          businessId,
          contactId,
          direction: dto.direction,
          amount,
          asOfDate: dto.asOfDate,
          notes: dto.notes?.trim() || null,
          recordedById: user.sub,
        }),
      )
      return this.toModel(created)
    } catch (error) {
      return this.handleServiceError('upsert', error, { contactId, businessId })
    }
  }

  async findAllForContact(contactId: string, businessId: string): Promise<ContactOpeningBalance[]> {
    try {
      await this.requireContact(contactId, businessId)
      const rows = await this.openingBalancesRepo.find({
        where: { businessId, contactId },
        order: { direction: 'ASC' },
      })
      return rows.map((row) => this.toModel(row))
    } catch (error) {
      return this.handleServiceError('findAllForContact', error, { contactId, businessId })
    }
  }

  async delete(contactId: string, businessId: string, direction: DebtDirection): Promise<void> {
    try {
      await this.requireContact(contactId, businessId)
      const existing = await this.openingBalancesRepo.findOne({
        where: { businessId, contactId, direction },
      })

      if (!existing) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.opening_balance_not_found' as never),
          'OPENING_BALANCE_NOT_FOUND',
        )
      }

      await this.openingBalancesRepo.delete(existing.id)
    } catch (error) {
      return this.handleServiceError('delete', error, { contactId, businessId, direction })
    }
  }

  async getNetPosition(contactId: string, businessId: string): Promise<ContactNetPosition> {
    try {
      const contact = await this.requireContact(contactId, businessId)
      const openingBalances = await this.openingBalancesRepo.find({
        where: { businessId, contactId },
      })

      const obMap = new Map(openingBalances.map((ob) => [ob.direction, ob.amount]))
      const receivableOb = obMap.get(DebtDirection.RECEIVABLE) ?? 0
      const payableOb = obMap.get(DebtDirection.PAYABLE) ?? 0

      const debts = await this.debtsRepo.find({
        where: { businessId, contactId },
        relations: ['payments'],
      })

      let receivableDebts = 0
      let receivablePaid = 0
      let payableDebts = 0
      let payablePaid = 0

      for (const debt of debts) {
        if (debt.status === DebtStatus.WRITTEN_OFF) continue
        const paid = this.roundMoney(
          (debt.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
        )
        const outstanding = this.roundMoney(Math.max(0, debt.originalAmount - paid))

        if (debt.direction === DebtDirection.RECEIVABLE) {
          receivableDebts = this.roundMoney(receivableDebts + outstanding)
          receivablePaid = this.roundMoney(receivablePaid + paid)
        } else {
          payableDebts = this.roundMoney(payableDebts + outstanding)
          payablePaid = this.roundMoney(payablePaid + paid)
        }
      }

      const receivableNet = this.roundMoney(receivableOb + receivableDebts)
      const payableNet = this.roundMoney(payableOb + payableDebts)

      return {
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone ?? null,
        },
        receivable: {
          openingBalance: receivableOb,
          totalDebts: receivableDebts,
          totalPaid: receivablePaid,
          netBalance: receivableNet,
        },
        payable: {
          openingBalance: payableOb,
          totalDebts: payableDebts,
          totalPaid: payablePaid,
          netBalance: payableNet,
        },
        net: this.roundMoney(receivableNet - payableNet),
      }
    } catch (error) {
      return this.handleServiceError('getNetPosition', error, { contactId, businessId })
    }
  }

  async getAgeingReport(businessId: string, direction: DebtDirection): Promise<AgeingReport> {
    try {
      const now = new Date()
      const today = now.toISOString().slice(0, 10)

      const debts = await this.debtsRepo.find({
        where: {
          businessId,
          direction,
          status: In([DebtStatus.OUTSTANDING, DebtStatus.PARTIALLY_PAID]),
        },
        relations: ['contact', 'payments'],
      })

      const contactIds = [...new Set(debts.map((d) => d.contactId))]
      const openingBalances =
        contactIds.length > 0
          ? await this.openingBalancesRepo.find({
              where: { businessId, contactId: In(contactIds), direction },
            })
          : []

      const obByContact = new Map(openingBalances.map((ob) => [ob.contactId, ob.amount]))

      const contactMap = new Map<
        string,
        {
          contact: Contact
          current: number
          moderate: number
          aged: number
          overdue: number
          total: number
        }
      >()

      for (const debt of debts) {
        if (!debt.contact) continue
        const paid = this.roundMoney(
          (debt.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
        )
        const outstanding = this.roundMoney(Math.max(0, debt.originalAmount - paid))
        if (outstanding <= 0) continue

        const ageDays = this.daysBetween(debt.createdAt, now)
        const entry = contactMap.get(debt.contactId) ?? {
          contact: debt.contact,
          current: 0,
          moderate: 0,
          aged: 0,
          overdue: 0,
          total: 0,
        }

        if (ageDays <= 7) {
          entry.current = this.roundMoney(entry.current + outstanding)
        } else if (ageDays <= 15) {
          entry.moderate = this.roundMoney(entry.moderate + outstanding)
        } else if (ageDays <= 30) {
          entry.aged = this.roundMoney(entry.aged + outstanding)
        } else {
          entry.overdue = this.roundMoney(entry.overdue + outstanding)
        }
        entry.total = this.roundMoney(entry.total + outstanding)
        contactMap.set(debt.contactId, entry)
      }

      // Also include contacts that only have opening balances
      for (const ob of openingBalances) {
        if (contactMap.has(ob.contactId)) continue
        const contact = await this.contactsRepo.findOne({ where: { id: ob.contactId, businessId } })
        if (!contact) continue
        contactMap.set(ob.contactId, {
          contact,
          current: 0,
          moderate: 0,
          aged: 0,
          overdue: 0,
          total: 0,
        })
      }

      const entries: AgeingEntry[] = [...contactMap.values()].map((e) => ({
        contactId: e.contact.id,
        contactName: e.contact.name,
        contactPhone: e.contact.phone ?? null,
        openingBalance: obByContact.get(e.contact.id) ?? 0,
        current: e.current,
        moderate: e.moderate,
        aged: e.aged,
        overdue: e.overdue,
        totalOutstanding: this.roundMoney(
          (obByContact.get(e.contact.id) ?? 0) + e.total,
        ),
      }))

      entries.sort((a, b) => b.totalOutstanding - a.totalOutstanding)

      const totals = entries.reduce(
        (acc, e) => ({
          openingBalance: this.roundMoney(acc.openingBalance + e.openingBalance),
          current: this.roundMoney(acc.current + e.current),
          moderate: this.roundMoney(acc.moderate + e.moderate),
          aged: this.roundMoney(acc.aged + e.aged),
          overdue: this.roundMoney(acc.overdue + e.overdue),
          totalOutstanding: this.roundMoney(acc.totalOutstanding + e.totalOutstanding),
        }),
        { openingBalance: 0, current: 0, moderate: 0, aged: 0, overdue: 0, totalOutstanding: 0 },
      )

      return { direction, asOf: today, entries, totals }
    } catch (error) {
      return this.handleServiceError('getAgeingReport', error, { businessId, direction })
    }
  }

  async findForContactAndDirection(
    contactId: string,
    businessId: string,
    direction: DebtDirection,
  ): Promise<ContactOpeningBalanceEntity | null> {
    return this.openingBalancesRepo.findOne({
      where: { businessId, contactId, direction },
    })
  }

  async findMapForContacts(
    businessId: string,
    contactIds: string[],
  ): Promise<Map<string, { receivable: number; payable: number }>> {
    const result = new Map<string, { receivable: number; payable: number }>()
    if (contactIds.length === 0) return result

    const rows = await this.openingBalancesRepo.find({
      where: { businessId, contactId: In(contactIds) },
    })

    for (const row of rows) {
      const entry = result.get(row.contactId) ?? { receivable: 0, payable: 0 }
      if (row.direction === DebtDirection.RECEIVABLE) {
        entry.receivable = this.roundMoney(row.amount)
      } else {
        entry.payable = this.roundMoney(row.amount)
      }
      result.set(row.contactId, entry)
    }

    return result
  }

  private toModel(entity: ContactOpeningBalanceEntity): ContactOpeningBalance {
    return {
      id: entity.id,
      contactId: entity.contactId,
      businessId: entity.businessId,
      direction: entity.direction,
      amount: entity.amount,
      asOfDate: entity.asOfDate,
      notes: entity.notes ?? null,
      recordedById: entity.recordedById ?? null,
      createdAt: toIsoString(entity.createdAt) ?? '',
      updatedAt: toIsoString(entity.updatedAt) ?? '',
    }
  }

  private async requireContact(contactId: string, businessId: string): Promise<Contact> {
    const contact = await this.contactsRepo.findOne({ where: { id: contactId, businessId } })
    if (!contact) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.contact_not_found' as never),
        'CONTACT_NOT_FOUND',
      )
    }
    return contact
  }

  private assertDirectionCompatibleWithType(type: ContactType, direction: DebtDirection) {
    if (direction === DebtDirection.RECEIVABLE && type === ContactType.SUPPLIER) {
      throw new AppBadRequestException(
        'Supplier contacts can only have payable opening balances',
        'OPENING_BALANCE_DIRECTION_INVALID',
      )
    }
    if (direction === DebtDirection.PAYABLE && type === ContactType.CUSTOMER) {
      throw new AppBadRequestException(
        'Customer contacts can only have receivable opening balances',
        'OPENING_BALANCE_DIRECTION_INVALID',
      )
    }
  }

  private assertDateOnly(value: string) {
    if (!DATE_ONLY_REGEX.test(value)) {
      throw new AppBadRequestException(
        'Opening balance date must be in YYYY-MM-DD format',
        'OPENING_BALANCE_DATE_INVALID',
      )
    }
  }

  private daysBetween(createdAt: Date, now: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24
    return Math.floor((now.getTime() - createdAt.getTime()) / msPerDay)
  }

  private roundMoney(value: number) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('OpeningBalancesService error', 'OpeningBalancesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('OpeningBalancesService unexpected error', 'OpeningBalancesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error' as never),
      'OPENING_BALANCES_SERVICE_ERROR',
      { action },
    )
  }
}
