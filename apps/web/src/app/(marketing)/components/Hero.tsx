'use client'
import type { TranslationKey, Locale } from '../translations'
import { PhoneMockup } from './PhoneMockup'
import styles from './Hero.module.css'

interface Props {
  t: (key: TranslationKey) => string
  locale: Locale
}

export function Hero({ t, locale }: Props) {
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <div>
          <div className={styles.eyebrow}>
            <div className={styles.eyebrowPill}>
              <span className={styles.dot} />
              {t('hero.eyebrow')}
            </div>
          </div>

          <h1 className={styles.title}>
            {t('hero.title.line1')}
            <br />
            <em>{t('hero.title.em')}</em>
          </h1>

          <p className={styles.sub}>{t('hero.sub')}</p>

          <div className={styles.ctas}>
            <a href="#access" className={styles.ctaPrimary}>{t('hero.cta1')}</a>
            <a href="#how" className={styles.ctaGhost}>{t('hero.cta2')}</a>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>100%</span>
              <span className={styles.statLabel}>{t('hero.stat1')}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>Android</span>
              <span className={styles.statLabel}>{t('hero.stat2')}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>OHADA</span>
              <span className={styles.statLabel}>{t('hero.stat3')}</span>
            </div>
          </div>
        </div>

        <div className={styles.right}>
          <PhoneMockup locale={locale} />
        </div>
      </div>
    </section>
  )
}
