'use client'
import type { TranslationKey } from '../translations'
import { useScrollReveal } from './useScrollReveal'
import styles from './Pricing.module.css'

interface Props {
  t: (key: TranslationKey) => string
}

interface PlanConfig {
  nameKey: TranslationKey
  tagKey: TranslationKey
  periodKey: TranslationKey
  features: TranslationKey[]
  offFeatures: TranslationKey[]
  popular?: boolean
}

const PLANS: PlanConfig[] = [
  {
    nameKey: 'plan1.name',
    tagKey: 'plan1.tag',
    periodKey: 'plan1.period',
    features: ['plan1.f1', 'plan1.f2', 'plan1.f3', 'plan1.f4'],
    offFeatures: ['plan1.f5', 'plan1.f6', 'plan1.f7'],
  },
  {
    nameKey: 'plan2.name',
    tagKey: 'plan2.tag',
    periodKey: 'plan2.period',
    features: ['plan2.f1', 'plan2.f2', 'plan2.f3', 'plan2.f4', 'plan2.f5', 'plan2.f6'],
    offFeatures: ['plan2.f7'],
    popular: true,
  },
  {
    nameKey: 'plan3.name',
    tagKey: 'plan3.tag',
    periodKey: 'plan3.period',
    features: ['plan3.f1', 'plan3.f2', 'plan3.f3', 'plan3.f4', 'plan3.f5', 'plan3.f6'],
    offFeatures: ['plan3.f7'],
  },
  {
    nameKey: 'plan4.name',
    tagKey: 'plan4.tag',
    periodKey: 'plan4.period',
    features: ['plan4.f1', 'plan4.f2', 'plan4.f3', 'plan4.f4', 'plan4.f5', 'plan4.f6', 'plan4.f7'],
    offFeatures: [],
  },
]

export function Pricing({ t }: Props) {
  const { ref, visible } = useScrollReveal<HTMLElement>()

  return (
    <section
      id="pricing"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.inner}>
        <div className={styles.eyebrow}>{t('price.eyebrow')}</div>
        <h2 className={styles.title}>
          {t('price.title.line1')} <em>{t('price.title.em')}</em>
        </h2>
        <p className={styles.sub}>{t('price.sub')}</p>
        <p className={styles.note}>{t('price.note')}</p>

        <div className={styles.grid}>
          {PLANS.map((plan, i) => (
            <div key={i} className={`${styles.card} ${plan.popular ? styles.popular : ''}`}>
              {plan.popular && (
                <div className={styles.popularBadge}>{t('popular')}</div>
              )}
              <div className={styles.planName}>{t(plan.nameKey)}</div>
              <div className={styles.planTag}>{t(plan.tagKey)}</div>
              <div className={styles.period}>{t(plan.periodKey)}</div>
              <hr className={styles.divider} />
              <ul className={styles.features}>
                {plan.features.map(k => (
                  <li key={k} className={styles.feat}>{t(k)}</li>
                ))}
                {plan.offFeatures.map(k => (
                  <li key={k} className={`${styles.feat} ${styles.off}`}>{t(k)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
