'use client'

import { useState } from 'react'
import { CHILD_GRANULARITY } from '@api/common'
import { useNarrations } from '@/lib/queries'
import { formatUsd } from '@/lib/format'
import type { Narration, NarrationGranularity } from '@/lib/api-client'

interface View {
  granularity: NarrationGranularity
  from?: string
  to?: string
  label: string
}

const ROOT: View = { granularity: 'month', label: 'All time' }

/** Formats a narration's period as a human label for its granularity. */
function periodLabel(n: Narration): string {
  const d = new Date(n.periodStart)
  switch (n.granularity) {
    case 'month':
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    case 'week':
      return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
    case 'day':
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    case '6h':
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', hour12: false, timeZone: 'UTC' })
  }
}

/**
 * The zoomable narration recap. Starts at monthly level; clicking a period
 * drills into its finer-grained narrations (month → week → day → 6h).
 */
export function NarrationPanel() {
  const [stack, setStack] = useState<View[]>([ROOT])
  const view = stack[stack.length - 1]

  const { data: narrations = [], isLoading } = useNarrations({
    granularity: view.granularity,
    from: view.from,
    to: view.to,
  })

  const canZoom = (n: Narration) => CHILD_GRANULARITY[n.granularity] !== null

  const zoomInto = (n: Narration) => {
    const child = CHILD_GRANULARITY[n.granularity]
    if (!child) return
    setStack(s => [
      ...s,
      { granularity: child, from: n.periodStart, to: n.periodEnd, label: periodLabel(n) },
    ])
  }

  const zoomTo = (depth: number) => setStack(s => s.slice(0, depth + 1))

  // Most recent first.
  const ordered = [...narrations].sort(
    (a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime(),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontWeight: 600, fontSize: '12px' }}>What the bot has done</span>
        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)', marginLeft: 'auto' }}>
          {stack.map((v, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: 'var(--muted)' }}> › </span>}
              <button
                onClick={() => zoomTo(i)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontFamily: 'monospace', fontSize: '10px',
                  color: i === stack.length - 1 ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {v.label}
              </button>
            </span>
          ))}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {isLoading && <p style={{ color: 'var(--muted)', fontSize: '11px' }}>Loading…</p>}
        {!isLoading && ordered.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '11px' }}>
            No narration yet — run the backfill or wait for the first scheduled recap.
          </p>
        )}
        {ordered.map(n => {
          const pnlColor = n.stats.pnl > 0 ? 'var(--pos)' : n.stats.pnl < 0 ? 'var(--neg)' : 'var(--muted)'
          const zoomable = canZoom(n)
          return (
            <div
              key={n.id}
              onClick={() => zoomable && zoomInto(n)}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '11px 13px',
                cursor: zoomable ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '5px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: 'var(--fg)' }}>
                  {periodLabel(n)}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: pnlColor, marginLeft: 'auto' }}>
                  {formatUsd(n.stats.pnl)}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)' }}>
                  {n.stats.trades} trades
                </span>
              </div>
              <p style={{ fontSize: '11.5px', color: 'var(--fg)', lineHeight: 1.55, margin: 0 }}>{n.summary}</p>
              {n.assessment && (
                <p style={{ fontSize: '10.5px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5, margin: '5px 0 0' }}>
                  {n.assessment}
                </p>
              )}
              {zoomable && (
                <div style={{ fontFamily: 'monospace', fontSize: '9px', color: 'var(--accent)', marginTop: '6px' }}>
                  zoom in ▸
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
