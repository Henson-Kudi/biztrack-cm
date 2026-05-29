'use client'
import { useState, useEffect } from 'react'
import type { Locale, TranslationKey } from '../translations'
import styles from './PrelaunchNav.module.css'

interface Props {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey) => string
}

export function PrelaunchNav({ locale, setLocale, t }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const close = () => setOpen(false)

  return (
    <>
      <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ''}`}>
        <div className={styles.inner}>
          <a href="#" className={styles.logo}>
            BizTrack <span>CM</span>
          </a>

          <div className={styles.links}>
            <a href="#features" className={styles.link}>{t('nav.features')}</a>
            <a href="#how" className={styles.link}>{t('nav.how')}</a>
            <a href="#pricing" className={styles.link}>{t('nav.pricing')}</a>
            <a href="#contact" className={styles.link}>{t('nav.contact')}</a>

            <div className={styles.localePill}>
              <button
                className={`${styles.localeBtn} ${locale === 'fr' ? styles.active : ''}`}
                onClick={() => setLocale('fr')}
              >
                FR
              </button>
              <button
                className={`${styles.localeBtn} ${locale === 'en' ? styles.active : ''}`}
                onClick={() => setLocale('en')}
              >
                EN
              </button>
            </div>

            <a href="#access" className={styles.ctaBtn}>{t('nav.cta')}</a>
          </div>

          <button
            className={`${styles.hamburger} ${open ? styles.open : ''}`}
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      <div className={`${styles.overlay} ${open ? styles.open : ''}`} aria-hidden={!open}>
        <a href="#features" className={styles.overlayLink} onClick={close}>{t('nav.features')}</a>
        <a href="#how" className={styles.overlayLink} onClick={close}>{t('nav.how')}</a>
        <a href="#pricing" className={styles.overlayLink} onClick={close}>{t('nav.pricing')}</a>
        <a href="#contact" className={styles.overlayLink} onClick={close}>{t('nav.contact')}</a>

        <div className={styles.localePill} style={{ marginTop: '0.5rem' }}>
          <button
            className={`${styles.localeBtn} ${locale === 'fr' ? styles.active : ''}`}
            onClick={() => { setLocale('fr'); close() }}
          >
            FR
          </button>
          <button
            className={`${styles.localeBtn} ${locale === 'en' ? styles.active : ''}`}
            onClick={() => { setLocale('en'); close() }}
          >
            EN
          </button>
        </div>

        <a href="#access" className={styles.overlayCta} onClick={close}>
          {t('nav.cta')}
        </a>
      </div>
    </>
  )
}
