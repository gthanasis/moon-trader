import { BacktestChart } from '@/components/backtest-chart'
import { StatCard } from '@/components/stat-card'
import { formatUsd, formatPct, formatDuration } from '@/lib/format'
import type { BacktestResult } from '@trader/backtest'

export function BacktestResults({ result }: { result: BacktestResult }) {
  const { stats, pnlCurve } = result
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <StatCard label="Total P&L" labelSimple="Total Profit"
          value={formatUsd(stats.totalPnl)}
          colorVariant={stats.totalPnl >= 0 ? 'pos' : 'neg'} />
        <StatCard label="Win Rate" labelSimple="Trades that won"
          value={formatPct(stats.winRate * 100)} />
        <StatCard label="Total Trades" value={String(stats.totalTrades)} />
        <StatCard label="Max Drawdown" labelSimple="Worst losing stretch"
          value={formatPct(stats.maxDrawdown * 100)} colorVariant="neg" />
        <StatCard label="Sharpe Ratio" labelSimple="Risk vs Reward score"
          value={stats.sharpeRatio.toFixed(2)} colorVariant="info" />
        <StatCard label="Avg Hold Time" value={formatDuration(stats.avgHoldTimeMs)} />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '8px' }}>
          <span className="xp">BacktestResult.pnlCurve · PnlPoint[]</span>
          <span className="nb">How your capital grew over time</span>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px' }}>
          <BacktestChart pnlCurve={pnlCurve} />
        </div>
      </div>
    </div>
  )
}
