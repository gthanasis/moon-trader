'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getBotPaused, setBotPaused } from '@/app/actions'

const PAGE_TITLES: Record<string, string> = {
  '/':          'Overview',
  '/positions': 'Open Positions',
  '/trades':    'Trade History',
  '/backtest': 'Backtest',
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
  const [mode, setModeState] = useState<'expert' | 'noob'>('expert')
  // `paused` is null until the initial flag fetch resolves.
  const [paused, setPaused] = useState<boolean | null>(null)
  const [pauseBusy, setPauseBusy] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('traderMode')
    if (saved === 'noob') setModeState('noob')
  }, [])

  useEffect(() => {
    getBotPaused().then(setPaused).catch(() => setPaused(null))
  }, [])

  async function togglePaused() {
    if (paused === null || pauseBusy) return
    const next = !paused
    setPauseBusy(true)
    setPaused(next) // optimistic
    try {
      await setBotPaused(next)
    } catch {
      setPaused(!next) // revert on failure
    } finally {
      setPauseBusy(false)
    }
  }

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

        {/* bot pause toggle */}
        <button
          onClick={togglePaused}
          disabled={paused === null || pauseBusy}
          title={paused ? 'Bot paused — click to resume trading' : 'Bot running — click to pause trading'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '3px 10px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            background: 'transparent',
            fontSize: '10.5px', fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            color: paused ? 'var(--neg)' : 'var(--pos)',
            cursor: paused === null || pauseBusy ? 'default' : 'pointer',
            opacity: paused === null ? 0.5 : 1,
            transition: 'color 0.15s, opacity 0.15s',
          }}
        >
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: paused === null ? 'var(--muted)' : paused ? 'var(--neg)' : 'var(--pos)',
            display: 'inline-block',
          }} />
          {paused === null ? (
            '…'
          ) : (
            <>
              <span className="xp">{paused ? 'Paused' : 'Running'}</span>
              <span className="nb">{paused ? 'Bot Off' : 'Bot On'}</span>
            </>
          )}
        </button>

        {/* mode toggle */}
        <div style={{
          display: 'flex', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', overflow: 'hidden',
        }}>
          {(['expert', 'noob'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setModeState(m) }}
              style={{
                padding: '3px 10px',
                fontSize: '10.5px',
                fontFamily: 'monospace',
                background: mode === m ? 'var(--accent)' : 'transparent',
                color: mode === m ? '#000' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'background 0.15s, color 0.15s',
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
