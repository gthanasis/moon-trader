import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'
import { Topbar } from '@/components/topbar'
import { ModeProvider } from '@/components/mode-provider'
import { QueryProvider } from '@/components/query-provider'

export const metadata: Metadata = {
  title: 'Trader Dashboard',
  description: 'LLM-driven crypto trading bot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', minHeight: '100vh' }}>
        <QueryProvider>
          <ModeProvider />
          <Nav />
          <div style={{ marginLeft: 'var(--sidebar)', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Topbar />
            <main style={{ padding: '18px 20px', flex: 1 }}>{children}</main>
          </div>
        </QueryProvider>
      </body>
    </html>
  )
}
