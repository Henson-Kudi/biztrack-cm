'use client'
import type { TranslationKey } from '../translations'
import { useScrollReveal } from './useScrollReveal'
import styles from './Testimonials.module.css'

interface Props {
  t: (key: TranslationKey) => string
}

const TESTIMONIALS = [
  {
    quote:
      "J'ai découvert que j'avais XAF 45 000 de créances que j'avais complètement oubliées dans mon carnet. BizTrack me montre tout ça en un coup d'œil maintenant.",
    name: 'Chantal Oyono',
    role: 'Alimentation générale, Deido, Douala',
  },
  {
    quote:
      "Avant je ne savais jamais combien j'avais vraiment gagné dans la journée. Maintenant dès que je ferme la boutique, je regarde mon téléphone. C'est clair, c'est simple.",
    name: 'Jean-Pierre Manga',
    role: 'Boutique & demi-gros, Bonaberi, Douala',
  },
  {
    quote:
      "Mon comptable m'a demandé d'où vient le rapport que j'ai imprimé. Il pensait que j'avais un logiciel à XAF 500 000. C'est BizTrack CM, et c'est gratuit.",
    name: 'Nguia Francis',
    role: 'Commerce général, Akwa, Douala',
  },
]

export function Testimonials({ t }: Props) {
  const { ref, visible } = useScrollReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.inner}>
        <div className={styles.eyebrow}>{t('testi.eyebrow')}</div>
        <h2 className={styles.title}>
          {t('testi.title.line1')} <em>{t('testi.title.em')}</em>
        </h2>

        <div className={styles.grid}>
          {TESTIMONIALS.map((item, i) => (
            <div key={i} className={styles.card}>
              <p className={styles.quote}>{item.quote}</p>
              <div className={styles.author}>{item.name}</div>
              <div className={styles.role}>{item.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
