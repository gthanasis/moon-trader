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
      {/* Fixed viewport height so `main` has a definite size — the dashboard
          fills it exactly; taller pages scroll within `main`. */}
      <body style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <QueryProvider>
          <ModeProvider />
          <Nav />
          <div style={{ marginLeft: 'var(--sidebar)', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Topbar />
            <main style={{ padding: '18px 20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</main>
          </div>
        </QueryProvider>
      </body>
    </html>
  )
}
