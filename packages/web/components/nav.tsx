'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',          xp: 'Overview',        nb: 'Home' },
  { href: '/positions', xp: 'Open Positions',  nb: 'Active Trades' },
  { href: '/trades',    xp: 'Trade History',   nb: 'Past Trades' },
  { href: '/backtest',  xp: 'Backtest',        nb: 'Test the AI' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0,
      width: 'var(--sidebar)', height: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '16px 0', zIndex: 20,
    }}>
      {/* brand */}
      <div style={{ padding: '0 16px 16px', fontWeight: 600, fontSize: '14px' }}>
        Trader
      </div>

      {/* nav items */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
        {links.map(link => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'block',
                padding: '6px 8px',
                borderRadius: 'var(--r)',
                fontSize: '12px',
                textDecoration: 'none',
                background: active ? 'color-mix(in oklch, var(--accent) 10%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              <span className="xp">{link.xp}</span>
              <span className="nb">{link.nb}</span>
            </Link>
          )
        })}
      </div>

      {/* status badge */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--pos)', display: 'inline-block',
          }} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--muted)' }}>
            <span className="xp">Live · 15m cycle</span>
            <span className="nb">Live · checks every 15 min</span>
          </span>
        </div>
      </div>
    </nav>
  )
}
