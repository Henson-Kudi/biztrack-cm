import { redirect } from 'next/navigation'
import { Fraunces, DM_Sans } from 'next/font/google'
import { MarketingContent } from './(marketing)/MarketingContent'

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' })

export default function RootPage() {
  if (process.env.NEXT_PUBLIC_SHOW_PRELAUNCH !== 'true') {
    redirect('/dashboard')
  }
  return (
    <div className={`${fraunces.variable} ${dmSans.variable}`}>
      <MarketingContent />
    </div>
  )
}
