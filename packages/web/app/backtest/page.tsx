'use client'

import { useFormState } from 'react-dom'
import { runBacktest } from './actions'
import { BacktestChart } from '@/components/backtest-chart'
import { StatCard } from '@/components/stat-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatUsd, formatPct, formatDuration } from '@/lib/format'
import type { BacktestResult } from '@trader/backtest'

type ActionState = { result: BacktestResult | null; error: string | null }
const initialState: ActionState = { result: null, error: null }

async function backtestAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const result = await runBacktest(formData)
    return { result, error: null }
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export default function BacktestPage() {
  const [state, formAction] = useFormState(backtestAction, initialState)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Backtest</h1>

      <form action={formAction} className="space-y-4 max-w-lg mb-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="from">From date</Label>
            <Input id="from" name="from" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">To date</Label>
            <Input id="to" name="to" type="date" required />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="initialCapital">Initial Capital (USD)</Label>
          <Input id="initialCapital" name="initialCapital" type="number" defaultValue="1000" min="1" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="coins">Coins (comma-separated)</Label>
          <Input id="coins" name="coins" placeholder="BTC/USDT,ETH/USDT" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="model">LLM Model</Label>
          <Input id="model" name="model" defaultValue="claude-haiku-4-5" />
        </div>
        <Button type="submit">
          Run Backtest
        </Button>
      </form>

      {state.error && (
        <p className="text-red-600 mb-4">{state.error}</p>
      )}

      {state.result && (
        <BacktestResults result={state.result} />
      )}
    </div>
  )
}

function BacktestResults({ result }: { result: BacktestResult }) {
  const { stats, pnlCurve } = result
  const pnlVariant = stats.totalPnl >= 0 ? 'positive' : 'negative'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Total P&L" value={formatUsd(stats.totalPnl)} variant={pnlVariant} />
        <StatCard label="Win Rate" value={formatPct(stats.winRate * 100)} />
        <StatCard label="Total Trades" value={String(stats.totalTrades)} />
        <StatCard label="Max Drawdown" value={formatPct(stats.maxDrawdown * 100)} variant="negative" />
        <StatCard label="Sharpe Ratio" value={stats.sharpeRatio.toFixed(2)} />
        <StatCard label="Avg Hold Time" value={formatDuration(stats.avgHoldTimeMs)} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">P&L Curve</h2>
        <BacktestChart pnlCurve={pnlCurve} />
      </div>
    </div>
  )
}
