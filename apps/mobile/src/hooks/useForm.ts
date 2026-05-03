import { useState, useCallback, useRef } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** A validator receives the raw string value and returns an error message or null if valid. */
type Validator = (value: string) => string | null

/** Map of field keys to their validator functions. */
type Rules<K extends string> = Record<K, Validator>

/** Sparse map of error messages keyed by field name. */
type ErrorMap<K extends string> = Partial<Record<K, string>>

export interface UseFormReturn<K extends string> {
  /** Current error map — only contains keys that currently have errors. */
  errors: ErrorMap<K>
  /** True after the first call to validate(). Used to gate live re-validation. */
  hasSubmitted: boolean
  /**
   * Run every rule against the provided values.
   * Marks the form as submitted and populates errors.
   * Returns true if all fields pass.
   */
  validate: (values: Record<K, string>) => boolean
  /**
   * Re-validate a single field as the user types.
   * No-op until the first submit — avoids pre-flagging untouched fields.
   */
  touch: (field: K, value: string) => void
  /** Manually set a field error (e.g. from a server-side validation response). */
  setFieldError: (field: K, message: string) => void
  /** Clear a specific field's error without touching others. */
  clearFieldError: (field: K) => void
  /** Clear ALL errors (e.g. before a fresh network attempt). */
  clearErrors: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Lightweight form validation hook.
 *
 * Usage:
 * ```tsx
 * const form = useForm({
 *   name:  (v) => !v.trim() ? 'Name is required' : null,
 *   email: (v) => EMAIL_RE.test(v) ? null : 'Invalid email',
 * })
 *
 * // On submit:
 * if (!form.validate({ name, email })) return
 *
 * // On change:
 * onChangeText={(v) => { setName(v); form.touch('name', v) }}
 *
 * // Show error:
 * error={form.errors.name}
 * ```
 */
export function useForm<K extends string>(rules: Rules<K>): UseFormReturn<K> {
  const [errors, setErrors] = useState<ErrorMap<K>>({})

  // Use a ref for the submitted flag so `touch` can read it synchronously
  // without being recreated every time the flag changes.
  const hasSubmittedRef = useRef(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // Keep latest rules in a ref so callbacks don't need them as dependencies.
  const rulesRef = useRef(rules)
  rulesRef.current = rules

  // ── validate ────────────────────────────────────────────────────────────────

  const validate = useCallback((values: Record<K, string>): boolean => {
    // Mark submitted on first call
    hasSubmittedRef.current = true
    setHasSubmitted(true)

    const next: ErrorMap<K> = {}
    let allValid = true

    for (const key of Object.keys(rulesRef.current) as K[]) {
      const msg = rulesRef.current[key](values[key] ?? '')
      if (msg) {
        next[key] = msg
        allValid = false
      }
    }

    setErrors(next)
    return allValid
  }, [])

  // ── touch ───────────────────────────────────────────────────────────────────

  const touch = useCallback((field: K, value: string) => {
    // Gate: only re-validate after the user has attempted a submit at least once
    if (!hasSubmittedRef.current) return

    const msg = rulesRef.current[field]?.(value) ?? null

    setErrors((prev) => {
      const next = { ...prev }
      if (msg) {
        next[field] = msg
      } else {
        delete next[field]
      }
      return next
    })
  }, [])

  // ── helpers ─────────────────────────────────────────────────────────────────

  const setFieldError = useCallback((field: K, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }))
  }, [])

  const clearFieldError = useCallback((field: K) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearErrors = useCallback(() => setErrors({}), [])

  return { errors, hasSubmitted, validate, touch, setFieldError, clearFieldError, clearErrors }
}
