'use client'

import { useState } from 'react'
import type { Trade } from '@api/common'
import { formatUsd, formatDuration } from '@/lib/format'

function ReasoningCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <td
      style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: '280px', cursor: 'pointer', padding: '8px 8px 8px 0' }}
      onClick={() => setExpanded(v => !v)}
    >
      <span style={{
        display: '-webkit-box',
        WebkitLineClamp: expanded ? 'unset' : 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      } as React.CSSProperties}>
        {text}
      </span>
      <span style={{ color: 'var(--muted)', fontSize: '10px' }}> {expanded ? '↑' : '↓'}</span>
    </td>
  )
}

const HEADERS: [string, string][] = [
  ['Coin', 'Coin'],
  ['Side', 'Direction'],
  ['Entry', 'Bought At'],
  ['Exit', 'Sold At'],
  ['P&L', 'Profit / Loss'],
  ['Duration', 'How Long'],
  ['Reasoning', 'Why'],
]

interface TradesTableProps { trades: Trade[] }

export function TradesTable({ trades }: TradesTableProps) {
  if (trades.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '11px' }}>No trades yet.</p>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {HEADERS.map(([xp, nb]) => (
            <th key={xp} style={{
              textAlign: 'left', padding: '6px 8px 6px 0',
              fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border)', fontWeight: 500,
            }}>
              <span className="xp">{xp}</span>
              <span className="nb">{nb}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {trades.map(trade => {
          const pnl = trade.pnl ?? 0
          // Date fields arrive as ISO strings over HTTP — wrap before use.
          const durationMs =
            trade.closedAt && trade.openedAt
              ? new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime()
              : null

          return (
            <tr key={trade.id} style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = 'var(--sf2)')) }}
              onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = '')) }}
            >
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
                <span style={{ padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)', fontSize: '10.5px' }}>{trade.coin}</span>
              </td>
              <td style={{ padding: '8px 8px 8px 0' }}>
                <span style={{
                  padding: '2px 6px', borderRadius: '3px', fontSize: '10.5px', fontFamily: 'monospace', fontWeight: 500,
                  color: trade.side === 'buy' ? 'var(--pos)' : 'var(--neg)',
                  background: trade.side === 'buy'
                    ? 'color-mix(in oklch, var(--pos) 12%, transparent)'
                    : 'color-mix(in oklch, var(--neg) 12%, transparent)',
                }}>
                  <span className="xp">{trade.side.toUpperCase()}</span>
                  <span className="nb">{trade.side === 'buy' ? 'Long' : 'Short'}</span>
                </span>
              </td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>{formatUsd(trade.entryPrice)}</td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
                {trade.exitPrice != null ? formatUsd(trade.exitPrice) : '—'}
              </td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
                {trade.pnl != null
                  ? <span style={{ color: pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatUsd(pnl)}</span>
                  : '—'}
              </td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px', color: 'var(--muted)' }}>
                {durationMs != null ? formatDuration(durationMs) : '—'}
              </td>
              {trade.reasoning
                ? <ReasoningCell text={trade.reasoning} />
                : <td style={{ color: 'var(--muted)', fontSize: '11px', padding: '8px 8px 8px 0' }}>—</td>
              }
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
