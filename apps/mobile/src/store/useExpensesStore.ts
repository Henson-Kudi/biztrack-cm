import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// crypto.randomUUID() is built into Hermes (RN 0.72+) — no polyfill needed.
// Do NOT import react-native-get-random-values here; it requires a native module
// that isn't available without a full native build.

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | 'STOCK'
  | 'SALARIES'
  | 'RENT'
  | 'UTILITIES'
  | 'TRANSPORT'
  | 'MARKETING'
  | 'OTHER'

export interface Expense {
  id: string
  description: string
  amount: number          // XAF
  category: ExpenseCategory
  date: string            // ISO date string YYYY-MM-DD
  createdAt: string       // ISO timestamp
}

// ─── Category metadata ────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES: Record<
  ExpenseCategory,
  { label: string; color: string; bg: string; emoji: string }
> = {
  STOCK:      { label: 'Réapprovisionnement', color: '#185FA5', bg: '#E6F1FB', emoji: '📦' },
  SALARIES:   { label: 'Salaires',            color: '#639922', bg: '#EAF3DE', emoji: '👷' },
  RENT:       { label: 'Loyer',               color: '#BA7517', bg: '#FAEEDA', emoji: '🏠' },
  UTILITIES:  { label: 'Charges',             color: '#7C3AED', bg: '#EDE9FE', emoji: '⚡' },
  TRANSPORT:  { label: 'Transport',           color: '#0891B2', bg: '#E0F2FE', emoji: '🚚' },
  MARKETING:  { label: 'Marketing',           color: '#DB2777', bg: '#FCE7F3', emoji: '📣' },
  OTHER:      { label: 'Autre',               color: '#888780', bg: '#F1EFE8', emoji: '📝' },
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Le montant doit être un nombre positif.')
  }
}

function assertValidDate(date: string) {
  if (!DATE_RE.test(date)) {
    throw new Error('La date doit être au format YYYY-MM-DD.')
  }
}

function assertNonEmpty(value: string, field: string) {
  if (!value.trim()) {
    throw new Error(`${field} ne peut pas être vide.`)
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

interface ExpensesState {
  expenses: Expense[]

  // Mutations
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void
  removeExpense: (id: string) => void
  updateExpense: (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => void

  // Computed — yearMonth must be in "YYYY-MM" format
  totalForMonth: (yearMonth: string) => number
  expensesForMonth: (yearMonth: string) => Expense[]
}

// ─── Store (persisted to AsyncStorage) ───────────────────────────────────────

export const useExpensesStore = create<ExpensesState>()(
  persist(
    (set, get) => ({
      expenses: [],

      addExpense: (data) => {
        assertValidAmount(data.amount)
        assertValidDate(data.date)
        assertNonEmpty(data.description, 'Description')
        set((state) => ({
          expenses: [
            {
              ...data,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
            ...state.expenses,
          ],
        }))
      },

      removeExpense: (id) =>
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
        })),

      updateExpense: (id, updates) => {
        if (updates.amount !== undefined) assertValidAmount(updates.amount)
        if (updates.date !== undefined) assertValidDate(updates.date)
        if (updates.description !== undefined) assertNonEmpty(updates.description, 'Description')
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, ...updates } : e,
          ),
        }))
      },

      // Use exact slice comparison ("YYYY-MM") to avoid partial-prefix false matches
      // e.g. "2026-1" must NOT match "2026-10", "2026-11", "2026-12"
      totalForMonth: (yearMonth) => {
        if (!YEAR_MONTH_RE.test(yearMonth)) {
          throw new Error('yearMonth doit être au format YYYY-MM (ex: "2026-04").')
        }
        return get()
          .expenses.filter((e) => e.date.slice(0, 7) === yearMonth)
          .reduce((sum, e) => sum + e.amount, 0)
      },

      expensesForMonth: (yearMonth) => {
        if (!YEAR_MONTH_RE.test(yearMonth)) {
          throw new Error('yearMonth doit être au format YYYY-MM (ex: "2026-04").')
        }
        return get().expenses.filter((e) => e.date.slice(0, 7) === yearMonth)
      },
    }),
    {
      name: 'biztrack-expenses',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
