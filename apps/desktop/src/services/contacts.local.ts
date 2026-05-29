'use client'

import {
  ContactStatementEntryType,
  ContactType,
  DebtDirection,
  DebtStatus,
  PaymentMethod,
  Resource,
  type Contact,
  type ContactListResult,
  type ContactOpeningBalance,
  type Debt,
  type ContactSyncPayload,
  type ContactsQuery,
  type CreateContactRequest,
  type OpeningBalanceSyncPayload,
  type UpdateContactRequest,
  type UpsertOpeningBalanceRequest,
} from '@biztrack/types'
import { assertLocalPermissionAccess, getLocalQuotaGate } from '@/lib/plan-access'
import { usePlanStore } from '@/stores/plan.store'
import { listDebtsForContactsLocal } from './debts.local'
import { compareValues, dbBatch, dbQuery, normalizeSortOrder, paginateResult } from './local-db'
import { buildOutboxDeleteOperation, buildOutboxEventOperation, requestBackgroundSync } from './sync.local'

type ContactRow = {
  id: string
  business_id: string
  type: string
  name: string
  phone: string | null
  phone_alt: string | null
  address: string | null
  notes: string | null
  is_active: number | null
  created_by_id: string | null
  created_at: string
  updated_at: string
}

type OpeningBalanceRow = {
  id: string
  business_id: string
  contact_id: string
  direction: string
  amount: number
  as_of_date: string
  notes: string | null
  recorded_by_id: string | null
  created_at: string
  updated_at: string
}

type StatementDraft = {
  id: string
  sortAt: number
  date: string
  direction: DebtDirection
  type: ContactStatementEntryType
  reference: string
  debit: number
  credit: number
  method: PaymentMethod | null
}

type ContactSummarySnapshot = {
  totalReceivable: number
  totalPayable: number
  openDebts: number
  lastTransactionDate: string | null
}

type DirectionAggregate = {
  direction: DebtDirection
  totalOriginalAmount: number
  totalPaidAmount: number
  outstandingAmount: number
  openingBalance: number
  openDebtCount: number
  totalDebtCount: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  lastTransactionDate: string | null
  debts: LocalContactDebtRecord[]
  statementDrafts: StatementDraft[]
}

type OpeningBalanceInput = {
  amount: number
  asOfDate?: string | null
}

export type LocalContactStatementRecord = {
  id: string
  date: string
  direction: DebtDirection
  type: ContactStatementEntryType
  reference: string
  debit: number
  credit: number
  balance: number
  method: PaymentMethod | null
}

export type LocalContactDebtRecord = {
  id: string
  direction: DebtDirection
  reference: string
  status: DebtStatus
  originalAmount: number
  paidAmount: number
  outstandingAmount: number
  createdAt: string
}

export type LocalContactDirectionSummary = {
  direction: DebtDirection
  totalOriginalAmount: number
  totalPaidAmount: number
  outstandingAmount: number
  openingBalance: number
  openDebtCount: number
  totalDebtCount: number
  settlementRate: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
}

export type LocalContactRecord = Contact & {
  totalReceivable: number
  totalPayable: number
  openDebts: number
  lastTransactionDate?: string | null
}

export type LocalContactDetailRecord = LocalContactRecord & {
  receivableSummary: LocalContactDirectionSummary
  payableSummary: LocalContactDirectionSummary
  receivableDebts: LocalContactDebtRecord[]
  payableDebts: LocalContactDebtRecord[]
  receivableStatement: LocalContactStatementRecord[]
  payableStatement: LocalContactStatementRecord[]
  netBalance: number
}

export type LocalContactCreateInput = Pick<
  CreateContactRequest,
  'name' | 'phone' | 'phoneAlt' | 'address' | 'notes'
> & {
  createdById?: string | null
}

export type LocalContactUpdateInput = Required<Pick<UpdateContactRequest, 'type' | 'name' | 'phone'>> &
  Pick<UpdateContactRequest, 'phoneAlt' | 'address' | 'notes'>

export class ContactLocalError extends Error {
  constructor(
    public readonly code:
      | 'CONTACT_NAME_REQUIRED'
      | 'CONTACT_NAME_TOO_LONG'
      | 'CONTACT_PHONE_REQUIRED'
      | 'CONTACT_PHONE_INVALID'
      | 'CONTACT_ALREADY_EXISTS'
      | 'CONTACT_NOT_FOUND'
      | 'CONTACT_INACTIVE'
      | 'CONTACT_TYPE_INVALID'
      | 'CONTACT_TYPE_CONFLICT'
      | 'CONTACTS_QUOTA_REACHED',
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code)
    this.name = 'ContactLocalError'
  }
}

export async function listContactsLocal(
  businessId: string,
  query: ContactsQuery = {},
): Promise<ContactListResult> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const sortOrder = normalizeSortOrder(query.sortOrder)
  const rows = await dbQuery<ContactRow>(
    `
      SELECT
        id,
        business_id,
        type,
        name,
        phone,
        phone_alt,
        address,
        notes,
        is_active,
        created_by_id,
        created_at,
        updated_at
      FROM contacts
      WHERE business_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `,
    [normalizedBusinessId],
  )

  const summaryMap = await buildContactSummaryMapLocal(
    normalizedBusinessId,
    rows.map((row) => row.id),
  )
  const search = query.search?.trim().toLowerCase()
  let records = rows
    .map((row) => mapContactRow(row, summaryMap.get(row.id)))
    .filter((contact) => (query.type ? contact.type === query.type : true))
    .filter((contact) => (query.isActive === undefined ? true : contact.isActive === query.isActive))
    .filter((contact) => {
      if (!search) return true
      const haystack = [contact.name, contact.phone, contact.phoneAlt]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })

  const sortBy = query.sortBy ?? 'updatedAt'
  records = [...records].sort((left, right) => {
    switch (sortBy) {
      case 'name':
        return compareValues(left.name, right.name, sortOrder)
      case 'createdAt':
        return compareValues(left.createdAt, right.createdAt, sortOrder)
      case 'updatedAt':
      default:
        return compareValues(left.updatedAt, right.updatedAt, sortOrder)
    }
  })

  return paginateResult(records, query.page, query.limit)
}

export async function listCustomerContactsLocal(
  businessId: string,
  query: Omit<ContactsQuery, 'type'> = {},
) {
  return listContactsByAllowedTypesLocal(businessId, [ContactType.CUSTOMER, ContactType.BOTH], query)
}

export async function listSupplierContactsLocal(
  businessId: string,
  query: Omit<ContactsQuery, 'type'> = {},
) {
  return listContactsByAllowedTypesLocal(businessId, [ContactType.SUPPLIER, ContactType.BOTH], query)
}

async function listContactsByAllowedTypesLocal(
  businessId: string,
  allowedTypes: ContactType[],
  query: Omit<ContactsQuery, 'type'> = {},
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const placeholders = allowedTypes.map(() => '?').join(', ')
  const sortOrder = normalizeSortOrder(query.sortOrder)
  const rows = await dbQuery<ContactRow>(
    `
      SELECT
        id,
        business_id,
        type,
        name,
        phone,
        phone_alt,
        address,
        notes,
        is_active,
        created_by_id,
        created_at,
        updated_at
      FROM contacts
      WHERE business_id = ?
        AND type IN (${placeholders})
      ORDER BY updated_at DESC, created_at DESC
    `,
    [normalizedBusinessId, ...allowedTypes],
  )

  const summaryMap = await buildContactSummaryMapLocal(
    normalizedBusinessId,
    rows.map((row) => row.id),
  )
  const search = query.search?.trim().toLowerCase()
  let records = rows
    .map((row) => mapContactRow(row, summaryMap.get(row.id)))
    .filter((contact) => (query.isActive === undefined ? true : contact.isActive === query.isActive))
    .filter((contact) => {
      if (!search) return true
      const haystack = [contact.name, contact.phone, contact.phoneAlt]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })

  const sortBy = query.sortBy ?? 'updatedAt'
  records = [...records].sort((left, right) => {
    switch (sortBy) {
      case 'name':
        return compareValues(left.name, right.name, sortOrder)
      case 'createdAt':
        return compareValues(left.createdAt, right.createdAt, sortOrder)
      case 'updatedAt':
      default:
        return compareValues(left.updatedAt, right.updatedAt, sortOrder)
    }
  })

  return paginateResult(records, query.page, query.limit)
}

export async function getContactByIdLocal(
  businessId: string,
  contactId: string,
): Promise<LocalContactRecord | null> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedContactId = contactId.trim()
  if (!normalizedContactId) {
    return null
  }

  const [row] = await dbQuery<ContactRow>(
    `
      SELECT
        id,
        business_id,
        type,
        name,
        phone,
        phone_alt,
        address,
        notes,
        is_active,
        created_by_id,
        created_at,
        updated_at
      FROM contacts
      WHERE business_id = ?
        AND id = ?
      LIMIT 1
    `,
    [normalizedBusinessId, normalizedContactId],
  )

  if (!row) {
    return null
  }

  const summaryMap = await buildContactSummaryMapLocal(normalizedBusinessId, [normalizedContactId])
  return mapContactRow(row, summaryMap.get(normalizedContactId))
}

export async function getContactDetailLocal(
  businessId: string,
  contactId: string,
): Promise<LocalContactDetailRecord | null> {
  const normalizedBusinessId = assertBusinessId(businessId)
  const normalizedContactId = contactId.trim()
  if (!normalizedContactId) {
    return null
  }

  const [row] = await dbQuery<ContactRow>(
    `
      SELECT
        id,
        business_id,
        type,
        name,
        phone,
        phone_alt,
        address,
        notes,
        is_active,
        created_by_id,
        created_at,
        updated_at
      FROM contacts
      WHERE business_id = ?
        AND id = ?
      LIMIT 1
    `,
    [normalizedBusinessId, normalizedContactId],
  )

  if (!row) {
    return null
  }

  const [debts, obRows] = await Promise.all([
    listDebtsForContactsLocal(normalizedBusinessId, [normalizedContactId], { includePayments: true }),
    queryOpeningBalancesForContacts(normalizedBusinessId, [normalizedContactId]),
  ])
  return buildContactDetailFromDebts(row, debts, obRows)
}

export async function createCustomerContactLocal(
  businessId: string,
  input: LocalContactCreateInput,
): Promise<LocalContactRecord> {
  return createContactLocal(businessId, ContactType.CUSTOMER, input)
}

export async function createSupplierContactLocal(
  businessId: string,
  input: LocalContactCreateInput,
): Promise<LocalContactRecord> {
  return createContactLocal(businessId, ContactType.SUPPLIER, input)
}

export async function createContactByTypeLocal(
  businessId: string,
  type: ContactType,
  input: LocalContactCreateInput,
): Promise<LocalContactRecord> {
  return createContactLocal(businessId, type, input)
}

export async function updateContactLocal(
  businessId: string,
  contactId: string,
  input: LocalContactUpdateInput,
): Promise<LocalContactRecord> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.CONTACTS_MANAGE)
  const normalizedContactId = contactId.trim()

  if (!normalizedContactId) {
    throw new ContactLocalError('CONTACT_NOT_FOUND')
  }

  const existing = await getContactByIdLocal(normalizedBusinessId, normalizedContactId)
  if (!existing) {
    throw new ContactLocalError('CONTACT_NOT_FOUND')
  }

  const type = normalizeContactType(input.type)
  const name = input.name.trim()
  const phone = normalizeRequiredPhone(input.phone)
  const phoneAlt = normalizeOptionalPhone(input.phoneAlt)
  const address = normalizeOptionalText(input.address)
  const notes = normalizeOptionalText(input.notes)

  if (!name) {
    throw new ContactLocalError('CONTACT_NAME_REQUIRED')
  }

  if (name.length > 200) {
    throw new ContactLocalError('CONTACT_NAME_TOO_LONG')
  }

  const duplicate = await findContactByPrimaryPhoneLocal(normalizedBusinessId, phone)
  if (duplicate && duplicate.id !== normalizedContactId) {
    throw new ContactLocalError('CONTACT_ALREADY_EXISTS')
  }

  if (existing.type !== type) {
    await assertContactTypeCompatibleWithDebts(normalizedBusinessId, normalizedContactId, type)
  }

  const shouldUpdate =
    existing.type !== type ||
    existing.name !== name ||
    (existing.phone ?? null) !== phone ||
    (existing.phoneAlt ?? null) !== phoneAlt ||
    (existing.address ?? null) !== address ||
    (existing.notes ?? null) !== notes

  if (!shouldUpdate) {
    return existing
  }

  const now = new Date().toISOString()
  const payload: ContactSyncPayload = {
    type,
    name,
    phone,
    phoneAlt,
    address,
    notes,
    isActive: existing.isActive,
    createdById: existing.createdById || null,
    createdAt: existing.createdAt,
  }

  await dbBatch([
    {
      sql: `
        UPDATE contacts
        SET
          type = ?,
          name = ?,
          phone = ?,
          phone_alt = ?,
          address = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
          AND business_id = ?
      `,
      params: [
        type,
        name,
        phone,
        phoneAlt,
        address,
        notes,
        now,
        normalizedContactId,
        normalizedBusinessId,
      ],
    },
    buildOutboxEventOperation('contacts', normalizedContactId, payload),
  ])

  requestBackgroundSync()
  return (await getContactByIdLocal(normalizedBusinessId, normalizedContactId)) as LocalContactRecord
}

async function createContactLocal(
  businessId: string,
  type: ContactType,
  input: LocalContactCreateInput,
): Promise<LocalContactRecord> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.CONTACTS_MANAGE)
  const name = input.name.trim()
  const phone = normalizeRequiredPhone(input.phone)
  const phoneAlt = normalizeOptionalPhone(input.phoneAlt)
  const address = normalizeOptionalText(input.address)
  const notes = normalizeOptionalText(input.notes)

  if (!name) {
    throw new ContactLocalError('CONTACT_NAME_REQUIRED')
  }

  if (name.length > 200) {
    throw new ContactLocalError('CONTACT_NAME_TOO_LONG')
  }

  const existing = await findContactByPrimaryPhoneLocal(normalizedBusinessId, phone)
  if (existing) {
    if (existing.type === ContactType.BOTH) {
      return reuseExistingContactLocal(normalizedBusinessId, existing, {
        requestedType: type,
        phoneAlt,
        address,
        notes,
      })
    }

    if (existing.type === type) {
      throw new ContactLocalError('CONTACT_ALREADY_EXISTS')
    }

    return reuseExistingContactLocal(normalizedBusinessId, existing, {
      requestedType: ContactType.BOTH,
      phoneAlt,
      address,
      notes,
    })
  }

  const now = new Date().toISOString()
  const contactId = crypto.randomUUID()
  const createdById = normalizeOptionalUuid(input.createdById)

  // The desktop keeps contacts local first, but quota enforcement still has to
  // happen before the insert so we do not queue a contact that the API would
  // reject later as soon as connectivity returns.
  const contactQuota = await getLocalQuotaGate(normalizedBusinessId, 'contacts')
  if (!contactQuota.allowed) {
    throw new ContactLocalError('CONTACTS_QUOTA_REACHED', undefined, contactQuota)
  }

  const payload: ContactSyncPayload = {
    type,
    name,
    phone,
    phoneAlt,
    address,
    notes,
    createdById,
    createdAt: now,
  }

  await dbBatch([
    {
      sql: `
        INSERT INTO contacts (
          id,
          business_id,
          type,
          name,
          phone,
          phone_alt,
          address,
          notes,
          is_active,
          created_by_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `,
      params: [
        contactId,
        normalizedBusinessId,
        type,
        name,
        phone,
        phoneAlt,
        address,
        notes,
        createdById,
        now,
        now,
      ],
    },
    buildOutboxEventOperation('contacts', contactId, payload),
  ])

  void usePlanStore.getState().recalculateLocalUsage(normalizedBusinessId)
  requestBackgroundSync()
  return (await getContactByIdLocal(normalizedBusinessId, contactId)) as LocalContactRecord
}

async function findContactByPrimaryPhoneLocal(businessId: string, phone: string) {
  const rows = await dbQuery<ContactRow>(
    `
      SELECT
        id,
        business_id,
        type,
        name,
        phone,
        phone_alt,
        address,
        notes,
        is_active,
        created_by_id,
        created_at,
        updated_at
      FROM contacts
      WHERE business_id = ?
        AND phone IS NOT NULL
      ORDER BY updated_at DESC, created_at DESC
    `,
    [businessId],
  )

  const normalizedPhone = normalizePhoneForLookup(phone)
  return (
    rows
      .map((row) => mapContactRow(row))
      .find((contact) => normalizePhoneForLookup(contact.phone) === normalizedPhone) ?? null
  )
}

async function reuseExistingContactLocal(
  businessId: string,
  contact: LocalContactRecord,
  input: {
    requestedType: ContactType
    phoneAlt: string | null
    address: string | null
    notes: string | null
  },
) {
  const nextType = input.requestedType
  const nextPhoneAlt = contact.phoneAlt ?? input.phoneAlt
  const nextAddress = contact.address ?? input.address
  const nextNotes = contact.notes ?? input.notes
  const shouldUpdate =
    contact.type !== nextType ||
    !contact.isActive ||
    nextPhoneAlt !== contact.phoneAlt ||
    nextAddress !== contact.address ||
    nextNotes !== contact.notes

  if (!shouldUpdate) {
    return contact
  }

  const now = new Date().toISOString()
  if (!contact.isActive) {
    // Reactivating an archived contact consumes a live quota slot again, so we
    // block locally before the row is reintroduced to the sync outbox.
    const contactQuota = await getLocalQuotaGate(businessId, 'contacts')
    if (!contactQuota.allowed) {
      throw new ContactLocalError('CONTACTS_QUOTA_REACHED', undefined, contactQuota)
    }
  }
  const payload: ContactSyncPayload = {
    type: nextType,
    name: contact.name,
    phone: contact.phone ?? null,
    phoneAlt: nextPhoneAlt,
    address: nextAddress,
    notes: nextNotes,
    isActive: true,
    createdById: contact.createdById || null,
    createdAt: contact.createdAt,
  }

  await dbBatch([
    {
      sql: `
        UPDATE contacts
        SET
          type = ?,
          phone_alt = ?,
          address = ?,
          notes = ?,
          is_active = 1,
          updated_at = ?
        WHERE id = ?
          AND business_id = ?
      `,
      params: [
        nextType,
        nextPhoneAlt,
        nextAddress,
        nextNotes,
        now,
        contact.id,
        businessId,
      ],
    },
    buildOutboxEventOperation('contacts', contact.id, payload),
  ])

  void usePlanStore.getState().recalculateLocalUsage(businessId)
  requestBackgroundSync()
  return (await getContactByIdLocal(businessId, contact.id)) as LocalContactRecord
}

async function assertContactTypeCompatibleWithDebts(
  businessId: string,
  contactId: string,
  type: ContactType,
) {
  const debts = await listDebtsForContactsLocal(businessId, [contactId])
  const hasReceivableDebt = debts.some((debt) => debt.contactId === contactId && debt.direction === DebtDirection.RECEIVABLE)
  const hasPayableDebt = debts.some((debt) => debt.contactId === contactId && debt.direction === DebtDirection.PAYABLE)

  if (hasReceivableDebt && hasPayableDebt && type !== ContactType.BOTH) {
    throw new ContactLocalError('CONTACT_TYPE_CONFLICT')
  }

  if (hasReceivableDebt && type === ContactType.SUPPLIER) {
    throw new ContactLocalError('CONTACT_TYPE_CONFLICT')
  }

  if (hasPayableDebt && type === ContactType.CUSTOMER) {
    throw new ContactLocalError('CONTACT_TYPE_CONFLICT')
  }
}

async function buildContactSummaryMapLocal(businessId: string, contactIds: string[]) {
  const result = new Map<string, ContactSummarySnapshot>()
  if (contactIds.length === 0) {
    return result
  }

  const [debts, obRows] = await Promise.all([
    listDebtsForContactsLocal(businessId, contactIds),
    queryOpeningBalancesForContacts(businessId, contactIds),
  ])

  const obByContact = new Map<string, { receivable: number; payable: number }>()
  for (const ob of obRows) {
    const entry = obByContact.get(ob.contact_id) ?? { receivable: 0, payable: 0 }
    if (ob.direction === DebtDirection.RECEIVABLE) {
      entry.receivable = ob.amount
    } else {
      entry.payable = ob.amount
    }
    obByContact.set(ob.contact_id, entry)
  }

  const debtsByContactId = groupBy(debts, (debt) => debt.contactId)

  for (const contactId of contactIds) {
    const ob = obByContact.get(contactId)
    const contactDebts = debtsByContactId.get(contactId) ?? []
    const receivableAggregate = finalizeDirectionAggregate(
      buildReceivableAggregate(
        contactDebts.filter((debt) => debt.direction === DebtDirection.RECEIVABLE),
        ob?.receivable ? { amount: ob.receivable } : null,
      ),
    )
    const payableAggregate = finalizeDirectionAggregate(
      buildPayableAggregate(
        contactDebts.filter((debt) => debt.direction === DebtDirection.PAYABLE),
        ob?.payable ? { amount: ob.payable } : null,
      ),
    )

    result.set(contactId, {
      totalReceivable: receivableAggregate.summary.outstandingAmount,
      totalPayable: payableAggregate.summary.outstandingAmount,
      openDebts:
        receivableAggregate.summary.openDebtCount + payableAggregate.summary.openDebtCount,
      lastTransactionDate: maxDate(
        receivableAggregate.lastTransactionDate,
        payableAggregate.lastTransactionDate,
      ),
    })
  }

  return result
}

async function queryOpeningBalancesForContacts(
  businessId: string,
  contactIds: string[],
): Promise<OpeningBalanceRow[]> {
  if (contactIds.length === 0) return []
  const placeholders = contactIds.map(() => '?').join(', ')
  return dbQuery<OpeningBalanceRow>(
    `
      SELECT id, business_id, contact_id, direction, amount, as_of_date, notes, recorded_by_id, created_at, updated_at
      FROM contact_opening_balances
      WHERE business_id = ?
        AND contact_id IN (${placeholders})
    `,
    [businessId, ...contactIds],
  )
}

export async function listOpeningBalancesForContactLocal(
  businessId: string,
  contactId: string,
): Promise<ContactOpeningBalance[]> {
  const rows = await queryOpeningBalancesForContacts(businessId, [contactId])
  return rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    contactId: row.contact_id,
    direction: row.direction as DebtDirection,
    amount: row.amount,
    asOfDate: row.as_of_date,
    notes: row.notes ?? null,
    recordedById: row.recorded_by_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function upsertOpeningBalanceLocal(
  businessId: string,
  contactId: string,
  userId: string,
  dto: UpsertOpeningBalanceRequest,
): Promise<ContactOpeningBalance> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.OPENING_BALANCES)

  const existing = (
    await dbQuery<OpeningBalanceRow>(
      `SELECT id, created_at FROM contact_opening_balances WHERE business_id = ? AND contact_id = ? AND direction = ? LIMIT 1`,
      [normalizedBusinessId, contactId, dto.direction],
    )
  )[0]

  const now = new Date().toISOString()
  const id = existing?.id ?? crypto.randomUUID()
  const createdAt = existing?.created_at ?? now
  const payload: OpeningBalanceSyncPayload = {
    contactId,
    direction: dto.direction,
    amount: dto.amount,
    asOfDate: dto.asOfDate,
    notes: dto.notes ?? null,
    recordedById: userId,
    createdAt,
  }

  await dbBatch([
    {
      sql: `
        INSERT INTO contact_opening_balances (
          id, business_id, contact_id, direction, amount, as_of_date, notes, recorded_by_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          amount = excluded.amount,
          as_of_date = excluded.as_of_date,
          notes = excluded.notes,
          recorded_by_id = excluded.recorded_by_id,
          updated_at = excluded.updated_at
      `,
      params: [id, normalizedBusinessId, contactId, dto.direction, dto.amount, dto.asOfDate, dto.notes ?? null, userId, createdAt, now],
    },
    buildOutboxEventOperation('openingBalances', id, payload),
  ])

  requestBackgroundSync()

  return {
    id,
    businessId: normalizedBusinessId,
    contactId,
    direction: dto.direction,
    amount: dto.amount,
    asOfDate: dto.asOfDate,
    notes: dto.notes ?? null,
    recordedById: userId,
    createdAt,
    updatedAt: now,
  }
}

export async function deleteOpeningBalanceLocal(
  businessId: string,
  contactId: string,
  direction: DebtDirection,
): Promise<void> {
  const normalizedBusinessId = assertBusinessId(businessId)
  await assertLocalPermissionAccess(normalizedBusinessId, Resource.CONTACTS_MANAGE)

  const existing = (
    await dbQuery<OpeningBalanceRow>(
      `SELECT id FROM contact_opening_balances WHERE business_id = ? AND contact_id = ? AND direction = ? LIMIT 1`,
      [normalizedBusinessId, contactId, direction],
    )
  )[0]

  if (!existing) return

  await dbBatch([
    {
      sql: `DELETE FROM contact_opening_balances WHERE id = ?`,
      params: [existing.id],
    },
    buildOutboxDeleteOperation('openingBalances', existing.id),
  ])

  requestBackgroundSync()
}

function buildContactDetailFromDebts(
  row: ContactRow,
  debts: Debt[],
  obRows: OpeningBalanceRow[] = [],
): LocalContactDetailRecord {
  const obByDirection = new Map(obRows.map((ob) => [ob.direction as DebtDirection, ob]))
  const receivableOb = obByDirection.get(DebtDirection.RECEIVABLE)
  const payableOb = obByDirection.get(DebtDirection.PAYABLE)

  const receivableAggregate = finalizeDirectionAggregate(
    buildReceivableAggregate(
      debts.filter(
        (debt) => debt.contactId === row.id && debt.direction === DebtDirection.RECEIVABLE,
      ),
      receivableOb ? { amount: receivableOb.amount, asOfDate: receivableOb.as_of_date } : null,
    ),
  )
  const payableAggregate = finalizeDirectionAggregate(
    buildPayableAggregate(
      debts.filter((debt) => debt.contactId === row.id && debt.direction === DebtDirection.PAYABLE),
      payableOb ? { amount: payableOb.amount, asOfDate: payableOb.as_of_date } : null,
    ),
  )
  const summary = {
    totalReceivable: receivableAggregate.summary.outstandingAmount,
    totalPayable: payableAggregate.summary.outstandingAmount,
    openDebts:
      receivableAggregate.summary.openDebtCount + payableAggregate.summary.openDebtCount,
    lastTransactionDate: maxDate(
      receivableAggregate.lastTransactionDate,
      payableAggregate.lastTransactionDate,
    ),
  }

  return {
    ...mapContactRow(row, summary),
    receivableSummary: receivableAggregate.summary,
    payableSummary: payableAggregate.summary,
    receivableDebts: receivableAggregate.debts,
    payableDebts: payableAggregate.debts,
    receivableStatement: receivableAggregate.statement,
    payableStatement: payableAggregate.statement,
    netBalance: roundMoney(
      receivableAggregate.summary.outstandingAmount - payableAggregate.summary.outstandingAmount,
    ),
  }
}

function buildReceivableAggregate(debts: Debt[], openingBalance?: OpeningBalanceInput | null) {
  return buildDirectionAggregateFromDebts(debts, DebtDirection.RECEIVABLE, openingBalance)
}

function buildPayableAggregate(debts: Debt[], openingBalance?: OpeningBalanceInput | null) {
  return buildDirectionAggregateFromDebts(debts, DebtDirection.PAYABLE, openingBalance)
}

function buildDirectionAggregateFromDebts(
  debts: Debt[],
  direction: DebtDirection,
  openingBalance?: OpeningBalanceInput | null,
) {
  const aggregate = createDirectionAggregate(direction)

  if (openingBalance) {
    aggregate.openingBalance = roundMoney(openingBalance.amount)
    aggregate.outstandingAmount = roundMoney(openingBalance.amount)
    if (openingBalance.asOfDate) {
      aggregate.statementDrafts.push({
        id: `ob:${direction}`,
        sortAt: Date.parse(`${openingBalance.asOfDate}T00:00:00.000Z`) - 1,
        date: openingBalance.asOfDate,
        direction,
        type: ContactStatementEntryType.OPENING_BALANCE,
        reference: '',
        debit: openingBalance.amount,
        credit: 0,
        method: null,
      })
    }
  }

  for (const debt of debts) {
    const reference = debt.sourceReference || debt.id
    const createdAt = debt.createdAt
    const originalAmount = roundMoney(debt.originalAmount)
    const paidAmount = roundMoney(debt.paidAmount)
    const outstandingAmount = roundMoney(debt.outstandingAmount)
    const remainingBeforeWriteOff = roundMoney(Math.max(0, originalAmount - paidAmount))

    if (originalAmount <= 0) {
      continue
    }

    aggregate.totalOriginalAmount = roundMoney(aggregate.totalOriginalAmount + originalAmount)
    aggregate.totalPaidAmount = roundMoney(aggregate.totalPaidAmount + paidAmount)
    aggregate.outstandingAmount = roundMoney(aggregate.outstandingAmount + outstandingAmount)
    aggregate.totalDebtCount += 1
    if (
      (debt.status === DebtStatus.OUTSTANDING || debt.status === DebtStatus.PARTIALLY_PAID) &&
      outstandingAmount > 0
    ) {
      aggregate.openDebtCount += 1
    }

    aggregate.debts.push({
      id: debt.id,
      direction,
      reference,
      status: debt.status,
      originalAmount,
      paidAmount,
      outstandingAmount,
      createdAt,
    })
    aggregate.lastTransactionDate = maxDate(aggregate.lastTransactionDate, createdAt)
    aggregate.statementDrafts.push({
      id: `${debt.id}:debt`,
      sortAt: getTimestamp(createdAt),
      date: createdAt,
      direction,
      type: ContactStatementEntryType.DEBT_CREATED,
      reference,
      debit: originalAmount,
      credit: 0,
      method: null,
    })

    for (const payment of debt.payments ?? []) {
      const amount = roundMoney(payment.amount)
      aggregate.statementDrafts.push({
        id: payment.id,
        sortAt: getPaymentSortAt(payment.paymentDate, payment.createdAt),
        date: payment.paymentDate,
        direction,
        type: ContactStatementEntryType.PAYMENT,
        reference,
        debit: 0,
        credit: amount,
        method: payment.method,
      })
      aggregate.lastTransactionDate = maxDate(aggregate.lastTransactionDate, payment.createdAt)
      updateLastPayment(aggregate, payment.createdAt, amount)
    }

    if (
      debt.status === DebtStatus.WRITTEN_OFF &&
      debt.writtenOffAt &&
      remainingBeforeWriteOff > 0
    ) {
      aggregate.statementDrafts.push({
        id: `${debt.id}:write-off`,
        sortAt: getTimestamp(debt.writtenOffAt),
        date: debt.writtenOffAt,
        direction,
        type: ContactStatementEntryType.WRITE_OFF,
        reference,
        debit: 0,
        credit: remainingBeforeWriteOff,
        method: null,
      })
      aggregate.lastTransactionDate = maxDate(aggregate.lastTransactionDate, debt.writtenOffAt)
    }
  }

  return aggregate
}

function finalizeDirectionAggregate(aggregate: DirectionAggregate) {
  return {
    summary: {
      direction: aggregate.direction,
      totalOriginalAmount: roundMoney(aggregate.totalOriginalAmount),
      totalPaidAmount: roundMoney(aggregate.totalPaidAmount),
      outstandingAmount: roundMoney(aggregate.outstandingAmount),
      openingBalance: aggregate.openingBalance,
      openDebtCount: aggregate.openDebtCount,
      totalDebtCount: aggregate.totalDebtCount,
      settlementRate:
        aggregate.totalOriginalAmount > 0
          ? Math.round((aggregate.totalPaidAmount / aggregate.totalOriginalAmount) * 100)
          : 0,
      lastPaymentDate: aggregate.lastPaymentDate,
      lastPaymentAmount: aggregate.lastPaymentAmount,
    } satisfies LocalContactDirectionSummary,
    debts: [...aggregate.debts].sort((left, right) => {
      if (right.createdAt !== left.createdAt) {
        return right.createdAt.localeCompare(left.createdAt)
      }

      return left.reference.localeCompare(right.reference)
    }),
    statement: finalizeStatementEntries(aggregate.statementDrafts),
    lastTransactionDate: aggregate.lastTransactionDate,
  }
}

function finalizeStatementEntries(drafts: StatementDraft[]): LocalContactStatementRecord[] {
  let balance = 0

  return [...drafts]
    .sort((left, right) => {
      if (left.sortAt !== right.sortAt) {
        return left.sortAt - right.sortAt
      }

      const leftOrder = getStatementTypeSortOrder(left.type)
      const rightOrder = getStatementTypeSortOrder(right.type)
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }

      return left.id.localeCompare(right.id)
    })
    .map((draft) => {
      balance = roundMoney(balance + draft.debit - draft.credit)

      return {
        id: draft.id,
        date: draft.date,
        direction: draft.direction,
        type: draft.type,
        reference: draft.reference,
        debit: roundMoney(draft.debit),
        credit: roundMoney(draft.credit),
        balance,
        method: draft.method,
      }
    })
}

function mapContactRow(
  row: ContactRow,
  summary?: ContactSummarySnapshot,
): LocalContactRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    type: normalizeContactType(row.type),
    name: row.name,
    phone: row.phone ?? null,
    phoneAlt: row.phone_alt ?? null,
    address: row.address ?? null,
    notes: row.notes ?? null,
    isActive: Boolean(row.is_active ?? 1),
    createdById: row.created_by_id ?? '',
    createdBy: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalReceivable: summary?.totalReceivable ?? 0,
    totalPayable: summary?.totalPayable ?? 0,
    openDebts: summary?.openDebts ?? 0,
    lastTransactionDate: summary?.lastTransactionDate ?? null,
  }
}

function createDirectionAggregate(direction: DebtDirection): DirectionAggregate {
  return {
    direction,
    totalOriginalAmount: 0,
    totalPaidAmount: 0,
    outstandingAmount: 0,
    openingBalance: 0,
    openDebtCount: 0,
    totalDebtCount: 0,
    lastPaymentDate: null,
    lastPaymentAmount: null,
    lastTransactionDate: null,
    debts: [],
    statementDrafts: [],
  }
}

function updateLastPayment(
  aggregate: DirectionAggregate,
  date: string | null,
  amount: number,
) {
  if (!date) {
    return
  }

  if (!aggregate.lastPaymentDate || date >= aggregate.lastPaymentDate) {
    aggregate.lastPaymentDate = date
    aggregate.lastPaymentAmount = amount
  }
}

function getStatementTypeSortOrder(type: ContactStatementEntryType) {
  if (type === ContactStatementEntryType.OPENING_BALANCE) {
    return -1
  }

  if (type === ContactStatementEntryType.DEBT_CREATED) {
    return 0
  }

  if (type === ContactStatementEntryType.PAYMENT) {
    return 1
  }

  return 2
}

function normalizeContactType(value: string | null | undefined): ContactType {
  if (value === ContactType.SUPPLIER || value === ContactType.BOTH) {
    return value
  }

  return ContactType.CUSTOMER
}

function normalizeOptionalPhone(value: string | null | undefined) {
  const normalized = normalizePhoneForLookup(value)
  if (!normalized) {
    return null
  }

  if (normalized.length < 5 || normalized.length > 30) {
    throw new ContactLocalError('CONTACT_PHONE_INVALID')
  }

  return normalized
}

function normalizeRequiredPhone(value: string | null | undefined) {
  const normalized = normalizeOptionalPhone(value)
  if (!normalized) {
    throw new ContactLocalError('CONTACT_PHONE_REQUIRED')
  }

  return normalized
}

function normalizePhoneForLookup(value: string | null | undefined) {
  const trimmed = value?.trim() || ''
  if (!trimmed) {
    return null
  }

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) {
    return null
  }

  return trimmed.startsWith('+') ? `+${digits}` : digits
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() || null
  return normalized || null
}

function normalizeOptionalUuid(value: string | null | undefined) {
  const normalized = value?.trim() || ''
  if (!normalized) {
    return null
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  )
    ? normalized
    : null
}

function assertBusinessId(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new ContactLocalError('CONTACT_NOT_FOUND', 'Business is required.')
  }

  return normalized
}

function maxDate(current: string | null, candidate: string | null) {
  if (!candidate) {
    return current
  }

  if (!current) {
    return candidate
  }

  return candidate > current ? candidate : current
}

function getTimestamp(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getPaymentSortAt(paymentDate: string, createdAt: string) {
  const timestamp = Date.parse(`${paymentDate}T12:00:00.000Z`)
  if (!Number.isNaN(timestamp)) {
    return timestamp
  }

  return getTimestamp(createdAt)
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const key = getKey(item)
    const current = groups.get(key)
    if (current) {
      current.push(item)
    } else {
      groups.set(key, [item])
    }
  }

  return groups
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}
