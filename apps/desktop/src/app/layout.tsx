import './globals.css'
import type { ReactNode } from 'react'
import { Providers } from './providers'

export const metadata = {
  title: "BizTrack CM",
  description: "Desktop app",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
