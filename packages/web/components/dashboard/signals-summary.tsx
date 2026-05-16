'use client'

import { useState } from 'react'
import { useSignals } from '@/lib/queries'
import { SignalFeed } from '@/components/signal-feed'

/**
 * Signals are secondary — a single collapsed line by default, expandable to
 * the full feed on click.
 */
export function SignalsSummary() {
  const [open, setOpen] = useState(false)
  const { data: signals = [] } = useSignals()

  const sentiment = signals.filter(s => s.type === 'sentiment')
  const summary =
    signals.length === 0
      ? 'No signals in the last 24h'
      : `${signals.length} signals · last 24h${sentiment.length ? ` · ${sentiment.length} sentiment` : ''}`

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '10px 14px', color: 'var(--fg)', fontFamily: 'monospace', fontSize: '11px',
        }}
      >
        <span style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Signals
        </span>
        <span style={{ color: 'var(--fg)' }}>{summary}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', maxHeight: '240px', overflowY: 'auto' }}>
          <SignalFeed signals={signals.slice(0, 30)} />
        </div>
      )}
    </div>
  )
}
