'use client'

import { useId } from 'react'
import type { PnlPoint } from '@api/common'

interface BacktestChartProps {
  pnlCurve: PnlPoint[]
}

const W = 600
const H = 200
const PAD = { top: 10, right: 20, bottom: 30, left: 60 }

export function BacktestChart({ pnlCurve }: BacktestChartProps) {
  const gradientId = useId()
  if (pnlCurve.length < 2) return null

  const pts = pnlCurve.map(p => ({
    ts: new Date(p.timestamp).getTime(),
    cap: p.capital,
  }))

  const minTs = pts[0].ts
  const maxTs = pts[pts.length - 1].ts
  const minCap = Math.min(...pts.map(p => p.cap))
  const maxCap = Math.max(...pts.map(p => p.cap))
  const capRange = maxCap - minCap || 1

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const toX = (ts: number) => PAD.left + ((ts - minTs) / (maxTs - minTs)) * innerW
  const toY = (cap: number) => PAD.top + innerH - ((cap - minCap) / capRange) * innerH

  const linePoints = pts.map(p => `${toX(p.ts)},${toY(p.cap)}`).join(' ')
  const areaPoints = `${PAD.left},${PAD.top + innerH} ${linePoints} ${toX(maxTs)},${PAD.top + innerH}`

  const yTicks = Array.from({ length: 5 }, (_, i) => minCap + (capRange * i) / 4)
  const tsRange = maxTs - minTs
  const xTicks = Array.from({ length: 4 }, (_, i) => minTs + (tsRange * i) / 3)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-label="P&L curve"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--pos)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--pos)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {yTicks.map((v, i) => {
        const y = toY(v)
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4}
              textAnchor="end" fill="var(--muted)" fontSize="9" fontFamily="monospace">
              ${Math.round(v).toLocaleString()}
            </text>
          </g>
        )
      })}

      {xTicks.map((ts, i) => {
        const x = toX(ts)
        const label = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return (
          <g key={i}>
            <text x={x} y={H - 6}
              textAnchor="middle" fill="var(--muted)" fontSize="9" fontFamily="monospace">
              {label}
            </text>
          </g>
        )
      })}

      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline points={linePoints}
        fill="none" stroke="var(--pos)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
