'use client'
import { useState } from 'react'
import type { TranslationKey, Locale } from '../translations'
import { useScrollReveal } from './useScrollReveal'
import styles from './WaitlistForm.module.css'

interface Props {
  t: (key: TranslationKey) => string
  locale: Locale
}

export function WaitlistForm({ t, locale }: Props) {
  const { ref, visible } = useScrollReveal<HTMLElement>()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const validate = () => {
    const e: Record<string, boolean> = {}
    if (!name.trim()) e.name = true
    if (!email.trim()) e.email = true
    if (!phone.trim()) e.phone = true
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) return
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), locale }),
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        setErrorMsg(t('cta.error'))
      }
    } catch {
      setErrorMsg(t('cta.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      id="access"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.eyebrow}>{t('cta.eyebrow')}</div>
        <h2 className={styles.title}>
          {t('cta.title.line1')} <em>{t('cta.title.em')}</em>
        </h2>
        <p className={styles.sub}>{t('cta.sub')}</p>

        {success ? (
          <div className={styles.success}>{t('cta.success')}</div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <input
                type="text"
                placeholder={t('cta.ph.name')}
                value={name}
                onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: false })) }}
                className={`${styles.input} ${errors.name ? styles.error : ''}`}
                autoComplete="name"
              />
            </div>

            <div className={styles.field}>
              <input
                type="email"
                placeholder={t('cta.ph.email')}
                value={email}
                onChange={e => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: false })) }}
                className={`${styles.input} ${errors.email ? styles.error : ''}`}
                autoComplete="email"
              />
            </div>

            <div className={styles.field}>
              <input
                type="tel"
                placeholder={t('cta.ph.phone')}
                value={phone}
                onChange={e => { setPhone(e.target.value); setErrors(prev => ({ ...prev, phone: false })) }}
                className={`${styles.input} ${errors.phone ? styles.error : ''}`}
                autoComplete="tel"
              />
            </div>

            {errorMsg && <div className={styles.errorMsg}>{errorMsg}</div>}

            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? '...' : t('cta.btn')}
            </button>

            <p className={styles.note}>{t('cta.note')}</p>
          </form>
        )}
      </div>
    </section>
  )
}
