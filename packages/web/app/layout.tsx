import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'

export const metadata: Metadata = {
  title: 'Trader Dashboard',
  description: 'LLM-driven crypto trading bot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <Nav />
        <main className="flex-1 p-6">{children}</main>
      </body>
    </html>
  )
}
