'use client'
import type { TranslationKey } from '../translations'
import { useScrollReveal } from './useScrollReveal'
import styles from './HowItWorks.module.css'

interface Props {
  t: (key: TranslationKey) => string
}

const STEPS: Array<{ title: TranslationKey; desc: TranslationKey }> = [
  { title: 'step1.t', desc: 'step1.d' },
  { title: 'step2.t', desc: 'step2.d' },
  { title: 'step3.t', desc: 'step3.d' },
  { title: 'step4.t', desc: 'step4.d' },
]

export function HowItWorks({ t }: Props) {
  const { ref, visible } = useScrollReveal<HTMLElement>()

  return (
    <section
      id="how"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.inner}>
        <div>
          <div className={styles.eyebrow}>{t('how.eyebrow')}</div>
          <h2 className={styles.title}>
            {t('how.title.line1')} <em>{t('how.title.em')}</em>
          </h2>
          <p className={styles.sub}>{t('how.sub')}</p>

          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div key={i} className={styles.step}>
                <div className={styles.stepLine}>
                  <div className={styles.stepNum}>{i + 1}</div>
                  <div className={styles.connector} />
                </div>
                <div className={styles.stepContent}>
                  <div className={styles.stepTitle}>{t(s.title)}</div>
                  <p className={styles.stepDesc}>{t(s.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.receipt}>
          <div className={styles.receiptCenter}>
            <div className={styles.receiptBold}>AKWA BOUTIQUE</div>
            <div>Zone Commerciale Akwa, Douala</div>
          </div>
          <div className={styles.receiptDash} />
          <div className={styles.receiptRow}>
            <span>Caissier: Jean-Pierre</span>
          </div>
          <div className={styles.receiptRow}>
            <span>Date: 13/04/2025 17:52</span>
          </div>
          <div className={styles.receiptRow}>
            <span>Ref: VTE-20250413-0038</span>
          </div>
          <div className={styles.receiptDash} />
          <div className={styles.receiptRow}>
            <span>Eau Min 75cl ×3</span>
            <span>750</span>
          </div>
          <div className={styles.receiptRow}>
            <span>Savon Lux ×2</span>
            <span>1 000</span>
          </div>
          <div className={styles.receiptRow}>
            <span>Lait Gloria ×1</span>
            <span>1 800</span>
          </div>
          <div className={styles.receiptRow}>
            <span>Cube Maggi ×4</span>
            <span>1 200</span>
          </div>
          <div className={styles.receiptRow}>
            <span>Riz 5kg ×1</span>
            <span>3 500</span>
          </div>
          <div className={styles.receiptDash} />
          <div className={styles.receiptRow}>
            <span>Sous-total</span>
            <span>8 250</span>
          </div>
          <div className={styles.receiptRow}>
            <span>Remise fidélité</span>
            <span>-350</span>
          </div>
          <div className={styles.receiptRow}>
            <span>TVA 19.25%</span>
            <span>1 524</span>
          </div>
          <div className={styles.receiptDash} />
          <div className={`${styles.receiptRow} ${styles.receiptTotal}`}>
            <span>TOTAL</span>
            <span>9 424 XAF</span>
          </div>
          <div className={styles.receiptDash} />
          <div>Payé MTN MoMo ref TXN-847291</div>
          <div className={styles.receiptRow}>
            <span>Monnaie</span>
            <span>0 XAF</span>
          </div>
          <div className={styles.receiptDash} />
          <div className={styles.receiptFooter}>
            Gérez votre boutique avec BizTrack CM
            <br />
            biztrack.cm
          </div>
        </div>
      </div>
    </section>
  )
}
