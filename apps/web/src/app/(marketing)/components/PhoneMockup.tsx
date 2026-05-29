'use client'
import { useEffect, useState } from 'react'
import type { Locale } from '../translations'
import styles from './PhoneMockup.module.css'

const SALES_FR = [
  { name: 'Marie Ekotto', items: 'Eau Min × 3, Savon × 2', amount: '5 900 XAF' },
  { name: 'Paul Njock', items: 'Coca-Cola × 6, Sucre × 1', amount: '3 200 XAF' },
  { name: 'Client anonyme', items: 'Lait × 1, Pain × 2', amount: '2 100 XAF' },
]
const SALES_EN = [
  { name: 'Marie Ekotto', items: 'Min. Water × 3, Soap × 2', amount: '5,900 XAF' },
  { name: 'Paul Njock', items: 'Coca-Cola × 6, Sugar × 1', amount: '3,200 XAF' },
  { name: 'Walk-in', items: 'Milk × 1, Bread × 2', amount: '2,100 XAF' },
]

export function PhoneMockup({ locale }: { locale: Locale }) {
  const sales = locale === 'en' ? SALES_EN : SALES_FR
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const run = () => {
      timers.push(setTimeout(() => setPhase(1), 500))
      timers.push(setTimeout(() => setPhase(2), 850))
      timers.push(setTimeout(() => setPhase(3), 1200))
      timers.push(setTimeout(() => setPhase(4), 2000))
      timers.push(setTimeout(() => setPhase(5), 2800))
      timers.push(setTimeout(() => setPhase(6), 3600))
      timers.push(setTimeout(() => { setPhase(0); timers.push(setTimeout(run, 600)) }, 5500))
    }
    run()
    return () => timers.forEach(clearTimeout)
  }, [])

  const totalLabel = locale === 'en' ? 'Hourly total' : 'Total heure'
  const confirmText =
    locale === 'en' ? '✓ Sale recorded · Receipt sent' : '✓ Vente enregistrée · Reçu envoyé'

  return (
    <div className={styles.container}>
      <div className={styles.phone}>
        <div className={styles.notch} />
        <div className={styles.screen}>
          <div className={styles.header}>
            <div className={styles.shopName}>Akwa Boutique</div>
            <div className={styles.dateTime}>13/04/2025 · 17:52</div>
          </div>

          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{locale === 'en' ? 'Revenue' : 'Revenu'}</div>
              <div className={`${styles.kpiValue} ${styles.teal}`}>245 000</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{locale === 'en' ? 'Gross profit' : 'Bénéfice'}</div>
              <div className={styles.kpiValue}>97 000</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{locale === 'en' ? 'Receivables' : 'Créances'}</div>
              <div className={`${styles.kpiValue} ${styles.amber}`}>312 000</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{locale === 'en' ? 'Low stock' : 'Stock bas'}</div>
              <div className={`${styles.kpiValue} ${styles.red}`}>5</div>
            </div>
          </div>

          <div className={styles.sectionLabel}>
            {locale === 'en' ? 'Recent sales' : 'Ventes récentes'}
          </div>

          <div className={styles.saleRows}>
            {sales.map((s, i) => (
              <div
                key={i}
                className={`${styles.saleRow} ${phase > i ? styles.visible : ''}`}
              >
                <div className={styles.saleName}>{s.name}</div>
                <div className={styles.saleItems}>{s.items}</div>
                <div className={styles.saleAmount}>{s.amount}</div>
              </div>
            ))}
          </div>

          <div className={`${styles.totalBar} ${phase >= 4 ? styles.visible : ''}`}>
            <span className={styles.totalLabel}>{totalLabel}</span>
            <span className={styles.totalValue}>48 500 XAF</span>
          </div>

          <div className={`${styles.payButtons} ${phase >= 5 ? styles.visible : ''}`}>
            <div className={styles.payBtn}>Cash</div>
            <div className={styles.payBtn}>MTN MoMo</div>
            <div className={styles.payBtn}>Orange</div>
          </div>

          <div className={`${styles.confirm} ${phase >= 6 ? styles.visible : ''}`}>
            {confirmText}
          </div>
        </div>
      </div>

      <div className={`${styles.floatCard} ${styles.cardTop}`}>
        <div className={styles.cardLabel}>
          {locale === 'en' ? "Today's revenue" : "Revenu aujourd'hui"}
        </div>
        <div className={styles.cardValue}>245 000 XAF</div>
        <div className={styles.cardSub}>38 {locale === 'en' ? 'sales' : 'ventes'} · 39.6% marge</div>
      </div>

      <div className={`${styles.floatCard} ${styles.cardBottom}`}>
        <div className={styles.cardLabel}>
          {locale === 'en' ? 'Low stock' : 'Stock bas'}
        </div>
        <div className={styles.cardValue}>5 {locale === 'en' ? 'alerts' : 'alertes'}</div>
        <div className={styles.cardSub}>Eau min, Riz, Huile…</div>
      </div>
    </div>
  )
}
