'use client'
import type { TranslationKey } from '../translations'
import { useScrollReveal } from './useScrollReveal'
import styles from './Features.module.css'

interface Props {
  t: (key: TranslationKey) => string
}

const ICONS = ['🛒', '📦', '💳', '📑', '📊', '💰']
const KEYS: Array<{ title: TranslationKey; desc: TranslationKey; tag?: TranslationKey }> = [
  { title: 'f1.title', desc: 'f1.desc', tag: 'f1.tag' },
  { title: 'f2.title', desc: 'f2.desc' },
  { title: 'f3.title', desc: 'f3.desc' },
  { title: 'f4.title', desc: 'f4.desc' },
  { title: 'f5.title', desc: 'f5.desc' },
  { title: 'f6.title', desc: 'f6.desc' },
]

export function Features({ t }: Props) {
  const { ref, visible } = useScrollReveal<HTMLElement>()

  return (
    <section
      id="features"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.inner}>
        <div className={styles.eyebrow}>{t('feat.eyebrow')}</div>
        <h2 className={styles.title}>{t('feat.title')}</h2>
        <p className={styles.sub}>{t('feat.sub')}</p>

        <div className={styles.grid}>
          {KEYS.map((k, i) => (
            <div key={i} className={`${styles.card} ${i === 0 ? styles.featured : ''}`}>
              <div className={styles.cardIcon}>{ICONS[i]}</div>
              <h3 className={styles.cardTitle}>{t(k.title)}</h3>
              <p className={styles.cardDesc}>{t(k.desc)}</p>
              {k.tag && <span className={styles.tag}>{t(k.tag)}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
