'use client'

import { useState } from 'react'
import type { Trade } from '@trader/shared'
import { formatUsd } from '@/lib/format'

interface PositionsTableProps {
  positions: Trade[]
}

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
  ['Entry Price', 'Bought At'],
  ['Size', 'Size'],
  ['Reasoning', 'Why'],
]

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '11px' }}>No open positions.</p>
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
        {positions.map(pos => (
          <tr key={pos.id}
            style={{ borderBottom: '1px solid var(--border)' }}
            onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = 'var(--sf2)')) }}
            onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = '')) }}
          >
            <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
              <span style={{
                padding: '2px 6px', borderRadius: '3px',
                border: '1px solid var(--border)', fontSize: '10.5px',
              }}>{pos.coin}</span>
            </td>
            <td style={{ padding: '8px 8px 8px 0' }}>
              <span style={{
                padding: '2px 6px', borderRadius: '3px', fontSize: '10.5px',
                fontFamily: 'monospace', fontWeight: 500,
                color: pos.side === 'buy' ? 'var(--pos)' : 'var(--neg)',
                background: pos.side === 'buy'
                  ? 'color-mix(in oklch, var(--pos) 12%, transparent)'
                  : 'color-mix(in oklch, var(--neg) 12%, transparent)',
              }}>
                <span className="xp">{pos.side.toUpperCase()}</span>
                <span className="nb">{pos.side === 'buy' ? 'Long' : 'Short'}</span>
              </span>
            </td>
            <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
              {formatUsd(pos.entryPrice)}
            </td>
            <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
              {formatUsd(pos.size)}
            </td>
            {pos.reasoning
              ? <ReasoningCell text={pos.reasoning} />
              : <td style={{ color: 'var(--muted)', fontSize: '11px', padding: '8px 8px 8px 0' }}>—</td>
            }
          </tr>
        ))}
      </tbody>
    </table>
  )
}
