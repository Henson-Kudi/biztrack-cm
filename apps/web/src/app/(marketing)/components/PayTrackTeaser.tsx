'use client'
import type { TranslationKey } from '../translations'
import { useScrollReveal } from './useScrollReveal'
import styles from './PayTrackTeaser.module.css'

interface Props {
  t: (key: TranslationKey) => string
}

export function PayTrackTeaser({ t }: Props) {
  const { ref, visible } = useScrollReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.inner}>
        <div className={styles.card}>
          <div>
            <div className={styles.eyebrow}>{t('pt.eyebrow')}</div>
            <h2 className={styles.title}>{t('pt.title')}</h2>
            <p className={styles.desc}>{t('pt.desc')}</p>
            <div className={styles.tags}>
              <span className={styles.tag}>MTN Mobile Money</span>
              <span className={styles.tag}>Orange Money</span>
              <span className={styles.tag}>{t('pt.qr')}</span>
              <span className={styles.tag}>{t('pt.card')}</span>
            </div>
          </div>

          <div className={styles.right}>
            <span className={styles.payLogo}>📱</span>
            <span className={styles.payName}>PayTrack CM</span>
            <span className={styles.paySub}>{t('pt.sub')}</span>
            <span className={styles.paySub}>{t('pt.sub2')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
