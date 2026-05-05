'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const PAGE_TITLES: Record<string, string> = {
  '/':          'Overview',
  '/positions': 'Open Positions',
  '/trades':    'Trade History',
  '/backtest':  'Backtest',
}

function setMode(mode: 'expert' | 'noob') {
  if (mode === 'noob') {
    document.body.classList.add('noob')
  } else {
    document.body.classList.remove('noob')
  }
  localStorage.setItem('traderMode', mode)
}

export function Topbar() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? 'Trader'
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 20px',
      height: '44px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* live pulse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 6px var(--accent)',
            display: 'inline-block',
          }} />
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)' }}>
            {time}
          </span>
        </div>

        {/* mode toggle */}
        <div style={{
          display: 'flex', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', overflow: 'hidden',
        }}>
          {(['expert', 'noob'] as const).map(m => (
            <button
              key={m}
              data-mode={m}
              onClick={() => setMode(m)}
              style={{
                padding: '3px 10px',
                fontSize: '10.5px',
                fontFamily: 'monospace',
                background: 'transparent',
                color: 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {m === 'expert' ? 'Expert' : 'Simple'}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
