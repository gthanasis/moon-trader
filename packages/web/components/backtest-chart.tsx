'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PnlPoint } from '@trader/backtest'

interface BacktestChartProps {
  pnlCurve: PnlPoint[]
}

export function BacktestChart({ pnlCurve }: BacktestChartProps) {
  const data = pnlCurve.map(p => ({
    date: p.timestamp instanceof Date
      ? p.timestamp.toLocaleDateString()
      : new Date(p.timestamp).toLocaleDateString(),
    capital: p.capital,
  }))

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => `$${v.toLocaleString()}`}
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Capital']}
          />
          <Line
            type="monotone"
            dataKey="capital"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
