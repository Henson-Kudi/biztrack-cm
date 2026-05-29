'use client'
import styles from './MarketingContent.module.css'
import { useLocale } from './useLocale'
import { PrelaunchNav } from './components/PrelaunchNav'
import { Hero } from './components/Hero'
import { TrustedBy } from './components/TrustedBy'
import { Features } from './components/Features'
import { HowItWorks } from './components/HowItWorks'
import { Pricing } from './components/Pricing'
import { Testimonials } from './components/Testimonials'
import { PayTrackTeaser } from './components/PayTrackTeaser'
import { WaitlistForm } from './components/WaitlistForm'
import { Footer } from './components/Footer'

export function MarketingContent() {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className={styles.wrapper}>
      <div className={styles.noise} aria-hidden="true" />
      <PrelaunchNav locale={locale} setLocale={setLocale} t={t} />
      <Hero t={t} locale={locale} />
      <TrustedBy t={t} />
      <Features t={t} />
      <HowItWorks t={t} />
      <Pricing t={t} />
      <Testimonials t={t} />
      <PayTrackTeaser t={t} />
      <WaitlistForm t={t} locale={locale} />
      <Footer t={t} />
    </div>
  )
}
