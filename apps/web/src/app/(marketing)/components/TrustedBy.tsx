import type { TranslationKey } from '../translations'
import styles from './TrustedBy.module.css'

const CITIES = ['Douala', 'Yaoundé', 'Buea', 'Bamenda', 'Bafoussam', 'Garoua']

interface Props {
  t: (key: TranslationKey) => string
}

export function TrustedBy({ t }: Props) {
  return (
    <div className={styles.strip}>
      <div className={styles.inner}>
        <span className={styles.label}>{t('trusted.label')}</span>
        <div className={styles.pills}>
          {CITIES.map(city => (
            <span key={city} className={styles.pill}>
              📍 {city}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
