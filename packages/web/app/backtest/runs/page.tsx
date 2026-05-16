'use client'

import Link from 'next/link'
import { useBacktestRuns } from '@/lib/queries'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'done' ? 'var(--pos)' : status === 'error' ? 'var(--neg)' : 'var(--warn)'
  return (
    <span style={{
      fontFamily: 'monospace', fontSize: '10px', padding: '2px 6px',
      borderRadius: '3px', border: `1px solid ${color}`, color,
    }}>
      {status}
    </span>
  )
}

export default function BacktestRunsPage() {
  const { data: runs = [], isLoading } = useBacktestRuns()

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 400 }}>ID</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 400 }}>Created</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 400 }}>Range</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 400 }}>Model</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 400 }}>Interval</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 400 }}>Status</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 400 }}>P&L</th>
            </tr>
          </thead>
          <tbody>
            {(isLoading || runs.length === 0) && (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
                  {isLoading ? 'Loading…' : 'No backtest runs yet.'}
                </td>
              </tr>
            )}
            {runs.map(run => {
              const pnl = run.stats?.totalPnl
              const pnlColor = pnl == null ? 'var(--muted)' : pnl >= 0 ? 'var(--pos)' : 'var(--neg)'
              const intervalLabel = run.intervalMs >= 4 * 60 * 60 * 1000 ? '4h' : run.intervalMs >= 60 * 60 * 1000 ? '1h' : '15m'
              return (
                <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <Link href={`/backtest/runs/${run.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{formatDate(run.createdAt)}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--fg)' }}>
                    {formatDate(run.from)} → {formatDate(run.to)}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{run.model}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{intervalLabel}</td>
                  <td style={{ padding: '8px 10px' }}><StatusBadge status={run.status} /></td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: pnlColor }}>
                    {pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
