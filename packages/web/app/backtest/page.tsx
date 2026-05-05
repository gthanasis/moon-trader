'use client'

import { useFormState } from 'react-dom'
import { runBacktest } from './actions'
import { BacktestChart } from '@/components/backtest-chart'
import { StatCard } from '@/components/stat-card'
import { formatUsd, formatPct, formatDuration } from '@/lib/format'
import type { BacktestResult } from '@trader/backtest'

type ActionState = { result: BacktestResult | null; error: string | null }
const initial: ActionState = { result: null, error: null }

async function backtestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const result = await runBacktest(formData)
    return { result, error: null }
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

const MODELS = [
  { id: 'claude-haiku-4-5',  desc: '(fast)' },
  { id: 'claude-sonnet-4-6', desc: '(balanced)' },
  { id: 'claude-opus-4-7',   desc: '(smartest)' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px',
  background: 'var(--sf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--r)', color: 'var(--fg)',
  fontFamily: 'monospace', fontSize: '12px',
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '4px',
  fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

export default function BacktestPage() {
  const [state, formAction] = useFormState(backtestAction, initial)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', gap: '20px', alignItems: 'start' }}>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>Run Backtest</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={labelStyle}>From</label>
            <input name="from" type="date" required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input name="to" type="date" required style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>
            <span className="xp">Initial Capital ($)</span>
            <span className="nb">Starting money ($)</span>
          </label>
          <input name="initialCapital" type="number" defaultValue="1000" min="1" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Coins (comma-separated)</label>
          <input name="coins" placeholder="BTC/USDT,ETH/USDT" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>
            <span className="xp">LLM Model</span>
            <span className="nb">AI brain to use</span>
          </label>
          <select name="model" defaultValue="claude-haiku-4-5" style={inputStyle}>
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>
                {m.id} {m.desc}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" style={{
          padding: '7px 16px', borderRadius: 'var(--r)',
          background: 'var(--accent)', color: '#000',
          border: 'none', cursor: 'pointer',
          fontWeight: 600, fontSize: '12px',
        }}>
          Run Backtest
        </button>

        {state.error && (
          <p style={{ color: 'var(--neg)', fontSize: '11px' }}>{state.error}</p>
        )}
      </form>

      <div>
        {state.result ? (
          <BacktestResults result={state.result} />
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '11px', paddingTop: '40px', textAlign: 'center' }}>
            Results will appear here after running a backtest.
          </div>
        )}
      </div>
    </div>
  )
}

function BacktestResults({ result }: { result: BacktestResult }) {
  const { stats, pnlCurve } = result

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <StatCard
          label="Total P&L" labelSimple="Total Profit"
          value={formatUsd(stats.totalPnl)}
          colorVariant={stats.totalPnl >= 0 ? 'pos' : 'neg'}
        />
        <StatCard
          label="Win Rate" labelSimple="Trades that won"
          value={formatPct(stats.winRate * 100)}
        />
        <StatCard label="Total Trades" value={String(stats.totalTrades)} />
        <StatCard
          label="Max Drawdown" labelSimple="Worst losing stretch"
          value={formatPct(stats.maxDrawdown * 100)}
          colorVariant="neg"
        />
        <StatCard
          label="Sharpe Ratio" labelSimple="Risk vs Reward score"
          value={stats.sharpeRatio.toFixed(2)}
          colorVariant="info"
        />
        <StatCard
          label="Avg Hold Time"
          value={formatDuration(stats.avgHoldTimeMs)}
        />
      </div>

      <div>
        <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '8px' }}>
          <span className="xp">BacktestResult.pnlCurve · PnlPoint[]</span>
          <span className="nb">How your $1,000 would have grown over time</span>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px' }}>
          <BacktestChart pnlCurve={pnlCurve} />
        </div>
      </div>
    </div>
  )
}
