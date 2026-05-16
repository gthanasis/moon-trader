'use client'

import { useParams } from 'next/navigation'
import { BacktestResults } from '@/components/backtest-results'
import { useBacktestRun } from '@/lib/queries'
import type { BacktestResult } from '@/lib/api-client'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const ACTION_COLOR: Record<string, string> = {
  buy: 'var(--pos)',
  sell: 'var(--warn)',
  hold: 'var(--muted)',
}

export default function BacktestRunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: run, isLoading, isError } = useBacktestRun(id)

  if (isLoading) {
    return <p style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--muted)' }}>Loading…</p>
  }
  if (isError || !run) {
    return <p style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neg)' }}>Run not found.</p>
  }

  const intervalLabel = run.intervalMs >= 4 * 60 * 60 * 1000 ? '4h' : run.intervalMs >= 60 * 60 * 1000 ? '1h' : '15m'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* header */}
      <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        <span style={{ color: 'var(--fg)' }}>Run <span style={{ color: 'var(--accent)' }}>{run.id.slice(0, 8)}</span></span>
        <span>{formatDate(run.from)} → {formatDate(run.to)}</span>
        <span>{run.model}</span>
        <span>{intervalLabel} interval</span>
        <span>created {formatDate(run.createdAt)}</span>
      </div>

      {/* error state */}
      {run.status === 'error' && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--r)',
          background: 'color-mix(in srgb, var(--neg) 10%, transparent)',
          border: '1px solid var(--neg)', color: 'var(--neg)',
          fontFamily: 'monospace', fontSize: '12px',
        }}>
          {run.errorMessage ?? 'Unknown error'}
        </div>
      )}

      {/* stats + chart */}
      {run.stats && run.trades && run.pnlCurve && (
        <BacktestResults result={{ stats: run.stats, trades: run.trades, pnlCurve: run.pnlCurve } as BacktestResult} />
      )}

      {/* decisions */}
      {run.decisions && run.decisions.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
          }}>
            Decisions ({run.decisions.length})
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)' }}>
            {run.decisions.map((d, i) => {
              const color = ACTION_COLOR[d.action.toLowerCase()] ?? 'var(--muted)'
              const date = new Date(d.timestamp)
              const label = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
              return (
                <div key={i} style={{
                  padding: '6px 10px',
                  borderLeft: `3px solid ${color}`,
                  borderBottom: i < run.decisions.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', fontFamily: 'monospace', fontSize: '11px' }}>
                    <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
                    <span style={{ color, fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>{d.action}</span>
                    {d.action.toLowerCase() !== 'hold' && (
                      <span style={{ color: 'var(--fg)', flexShrink: 0 }}>{d.coin}</span>
                    )}
                    {d.action.toLowerCase() !== 'hold' && d.size > 0 && (
                      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>${d.size}</span>
                    )}
                    <span style={{ color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>
                      {(d.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {d.reasoning && (
                    <div style={{ marginTop: '3px', color: 'var(--muted)', fontSize: '10.5px', lineHeight: 1.5, fontFamily: 'monospace' }}>
                      {d.reasoning}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
