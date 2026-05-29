import type { TranslationKey } from '../translations'
import styles from './Footer.module.css'

interface Props {
  t: (key: TranslationKey) => string
}

export function Footer({ t }: Props) {
  return (
    <footer id="contact" className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <div className={styles.logo}>
              BizTrack <span>CM</span>
            </div>
            <div className={styles.tagline}>{t('footer.tagline')}</div>
          </div>

          <div className={styles.links}>
            <a href="#features" className={styles.link}>{t('nav.features')}</a>
            <a href="#pricing" className={styles.link}>{t('nav.pricing')}</a>
            <a href="#access" className={styles.link}>{t('nav.cta')}</a>
            <a href="mailto:hello@biztrack.cm" className={styles.link}>{t('nav.contact')}</a>
          </div>

          <div className={styles.social}>
            <span className={styles.socialLabel}>{t('footer.follow')}</span>
            <a
              href="https://www.linkedin.com/company/hk-soln"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkedinLink}
              aria-label="LinkedIn"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
              LinkedIn
            </a>
          </div>
        </div>

        <div className={styles.bottom}>
          <span className={styles.copy}>{t('footer.copy')}</span>
          <span className={styles.made}>{t('footer.made')}</span>
        </div>
      </div>
    </footer>
  )
}
