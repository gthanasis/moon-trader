'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BacktestResults } from '@/components/backtest-results'
import { api, backtestStreamUrl } from '@/lib/api-client'
import type { BacktestResult, BacktestRunSummary, BacktestRunDetail } from '@/lib/api-client'

// --- SSE types ---
interface StepDecision {
  action: string; coin: string; size: number; confidence: number; reasoning: string
  executed?: boolean
  blockedReason?: string
  executedSize?: number
}
interface StepEvent { type: 'step'; step: number; total: number; timestamp: string; decision: StepDecision }
interface ResultEvent { type: 'result'; result: BacktestResult }
interface ErrorEvent { type: 'error'; message: string }
interface RunCreatedEvent { type: 'run_created'; runId: string }
type SseEvent = StepEvent | ResultEvent | ErrorEvent | RunCreatedEvent

// --- cost estimate ---
const MODELS = [
  { id: 'gpt-4o-mini', desc: '(fast)',      inputPer1M: 0.15,  outputPer1M: 0.60 },
  { id: 'gpt-4o',      desc: '(balanced)',  inputPer1M: 2.50,  outputPer1M: 10.00 },
  { id: 'o1-mini',     desc: '(reasoning)', inputPer1M: 1.10,  outputPer1M: 4.40 },
]
const INTERVALS = [
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '1h',  ms: 60 * 60 * 1000 },
  { label: '4h',  ms: 4 * 60 * 60 * 1000 },
]
const EST_INPUT_TOKENS = 2_000
const EST_OUTPUT_TOKENS = 200
const MAX_DECISIONS = 200

function estimateCost(from: string, to: string, modelId: string, intervalMs: number) {
  if (!from || !to) return null
  const rangeMs = new Date(to).getTime() - new Date(from).getTime()
  if (rangeMs <= 0) return null
  const calls = Math.ceil(rangeMs / intervalMs)
  const pricing = MODELS.find(m => m.id === modelId) ?? MODELS[0]!
  const costPerCall = (EST_INPUT_TOKENS * pricing.inputPer1M + EST_OUTPUT_TOKENS * pricing.outputPer1M) / 1_000_000
  return { calls, cost: calls * costPerCall }
}
function formatCost(cost: number) {
  if (cost < 0.01) return '<$0.01'
  if (cost < 1) return `~$${cost.toFixed(2)}`
  return `~$${cost.toFixed(0)}`
}
function formatCalls(n: number) {
  return n >= 1000 ? `~${(n / 1000).toFixed(1)}k` : String(n)
}

// --- shared helpers ---
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

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtDateLong(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function pnlStr(pnl: number) {
  return `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`
}
function intervalLabel(ms: number) {
  return ms >= 4 * 60 * 60 * 1000 ? '4h' : ms >= 60 * 60 * 1000 ? '1h' : '15m'
}

const ACTION_COLOR: Record<string, string> = {
  buy: 'var(--pos)', sell: 'var(--warn)', hold: 'var(--muted)',
}

// --- main component ---
type Panel = 'none' | 'new' | string  // string = runId

interface Props {
  initialRuns: BacktestRunSummary[]
  defaultFrom?: string
  defaultTo?: string
}

export function BacktestUnified({ initialRuns, defaultFrom, defaultTo }: Props) {
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>('none')

  // form state
  const [from, setFrom]         = useState(defaultFrom ?? '')
  const [to, setTo]             = useState(defaultTo ?? '')
  const [model, setModel]       = useState('gpt-4o-mini')
  const [intervalMs, setIntervalMs] = useState(60 * 60 * 1000)
  const [coins, setCoins]       = useState('')
  const [capital, setCapital]   = useState('1000')

  // stream state
  const [status, setStatus]     = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [step, setStep]         = useState(0)
  const [total, setTotal]       = useState(0)
  const [decisions, setDecisions] = useState<StepEvent[]>([])
  const [result, setResult]     = useState<BacktestResult | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [runId, setRunId]       = useState<string | null>(null)

  // detail state
  const [detail, setDetail]     = useState<BacktestRunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const esRef    = useRef<EventSource | null>(null)
  const feedRef  = useRef<HTMLDivElement | null>(null)

  const estimate = useMemo(() => estimateCost(from, to, model, intervalMs), [from, to, model, intervalMs])

  useEffect(() => {
    if (status === 'running' && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [decisions, status])

  useEffect(() => {
    if (panel === 'none' || panel === 'new') return
    setDetailLoading(true)
    setDetail(null)
    api.getBacktestRun(panel)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [panel])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'running') return
    setStatus('running')
    setStep(0); setTotal(0); setDecisions([]); setResult(null)
    setError(null); setExpanded(null); setRunId(null)

    const es = new EventSource(
      backtestStreamUrl({
        from, to, model, intervalMs: String(intervalMs), initialCapital: capital,
        ...(coins.trim() ? { coins: coins.trim() } : {}),
      }),
    )
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as SseEvent
      if (event.type === 'run_created') {
        setRunId(event.runId)
      } else if (event.type === 'step') {
        setStep(event.step); setTotal(event.total)
        setDecisions(prev => {
          const next = [...prev, event]
          return next.length > MAX_DECISIONS ? next.slice(-MAX_DECISIONS) : next
        })
      } else if (event.type === 'result') {
        setResult(event.result); setStatus('done'); es.close()
        router.refresh()
      } else if (event.type === 'error') {
        setError(event.message); setStatus('error'); es.close()
      }
    }
    es.onerror = () => { setError('Stream connection lost'); setStatus('error'); es.close() }
  }

  function handleCancel() { esRef.current?.close(); setStatus('idle'); router.refresh() }

  const pct = total > 0 ? (step / total) * 100 : 0
  const running = status === 'running'
  const done    = status === 'done'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', gap: '20px', alignItems: 'start' }}>

      {/* ── left: run browser ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button
          onClick={() => { setPanel('new'); if (status !== 'running') setStatus('idle') }}
          style={{
            padding: '7px 16px', borderRadius: 'var(--r)',
            background: panel === 'new' ? 'var(--accent)' : 'var(--sf2)',
            color: panel === 'new' ? '#000' : 'var(--fg)',
            border: `1px solid ${panel === 'new' ? 'var(--accent)' : 'var(--border)'}`,
            cursor: 'pointer', fontWeight: 600, fontSize: '12px', width: '100%',
          }}
        >
          + New Backtest
        </button>

        {initialRuns.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '11px', padding: '12px 0', textAlign: 'center' }}>
            No runs yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {initialRuns.map(run => {
              const pnl = run.stats?.totalPnl
              const active = panel === run.id
              const sc = run.status === 'done' ? 'var(--pos)' : run.status === 'error' ? 'var(--neg)' : 'var(--warn)'
              return (
                <div key={run.id} onClick={() => setPanel(run.id)} style={{
                  padding: '8px 10px', borderRadius: 'var(--r)', cursor: 'pointer',
                  background: active ? 'color-mix(in oklch, var(--accent) 10%, transparent)' : 'transparent',
                  border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  display: 'flex', flexDirection: 'column', gap: '3px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: active ? 'var(--accent)' : 'var(--fg)' }}>
                      {run.id.slice(0, 8)}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: sc }}>{run.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)' }}>
                      {fmtDate(run.from)} → {fmtDate(run.to)} · {intervalLabel(run.intervalMs)}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: pnl == null ? 'var(--muted)' : pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                      {pnl == null ? '—' : pnlStr(pnl)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── right: panel ── */}
      <div>
        {panel === 'none' && (
          <div style={{ color: 'var(--muted)', fontSize: '11px', paddingTop: '40px', textAlign: 'center' }}>
            Select a run or start a new backtest.
          </div>
        )}

        {panel === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>From</label>
                  <input type="date" required value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>To</label>
                  <input type="date" required value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}><span className="xp">Initial Capital ($)</span><span className="nb">Starting money ($)</span></label>
                <input type="number" min="1" value={capital} onChange={e => setCapital(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Coins (comma-separated)</label>
                <input placeholder="BTC/USDT,ETH/USDT" value={coins} onChange={e => setCoins(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}><span className="xp">LLM Model</span><span className="nb">AI model</span></label>
                  <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
                    {MODELS.map(m => <option key={m.id} value={m.id}>{m.id} {m.desc}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}><span className="xp">Interval</span><span className="nb">Step size</span></label>
                  <select value={String(intervalMs)} onChange={e => setIntervalMs(Number(e.target.value))} style={inputStyle}>
                    {INTERVALS.map(i => <option key={i.ms} value={String(i.ms)}>{i.label}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={running} style={{
                padding: '7px 16px', borderRadius: 'var(--r)',
                background: running ? 'var(--sf2)' : 'var(--accent)',
                color: running ? 'var(--muted)' : '#000',
                border: 'none', cursor: running ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: '12px',
              }}>
                {running ? 'Running…' : 'Run Backtest'}
              </button>

              {estimate && !running && !done && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: 'var(--r)',
                  background: 'var(--sf2)', border: '1px solid var(--border)',
                  fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)',
                }}>
                  <span>{formatCalls(estimate.calls)} LLM calls</span>
                  <span style={{ color: estimate.cost > 5 ? 'var(--neg)' : 'var(--fg)' }}>{formatCost(estimate.cost)}</span>
                </div>
              )}

              {(running || done) && <ProgressBar pct={pct} step={step} total={total} done={done} />}

              {running && (
                <button type="button" onClick={handleCancel} style={{
                  padding: '5px 12px', borderRadius: 'var(--r)',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '11px',
                }}>
                  Cancel
                </button>
              )}

              {done && runId && (
                <button type="button" onClick={() => setPanel(runId)} style={{
                  padding: '6px 12px', borderRadius: 'var(--r)',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--accent)', cursor: 'pointer', fontSize: '11px',
                  fontFamily: 'monospace',
                }}>
                  View saved run →
                </button>
              )}

              {status === 'error' && error && (
                <p style={{ color: 'var(--neg)', fontSize: '11px', margin: 0 }}>{error}</p>
              )}
            </form>

            {/* live feed */}
            {(running || (done && decisions.length > 0)) && (
              <DecisionFeed items={decisions.map(e => ({ ...e.decision, timestamp: e.timestamp }))}
                feedRef={feedRef} expanded={expanded} onExpand={setExpanded} live={running} />
            )}

            {/* results */}
            {done && result && <BacktestResults result={result} />}
          </div>
        )}

        {panel !== 'none' && panel !== 'new' && (
          detailLoading ? (
            <div style={{ color: 'var(--muted)', fontSize: '11px', paddingTop: '40px', textAlign: 'center' }}>
              Loading…
            </div>
          ) : detail ? (
            <RunDetail run={detail} onRerun={() => {
              setFrom(new Date(detail.from).toISOString().slice(0, 10))
              setTo(new Date(detail.to).toISOString().slice(0, 10))
              setModel(detail.model)
              setIntervalMs(detail.intervalMs)
              setCoins(detail.coins.join(', '))
              setCapital(String(detail.initialCapital))
              setStatus('idle')
              setPanel('new')
            }} />
          ) : (
            <div style={{ color: 'var(--neg)', fontSize: '11px', paddingTop: '40px', textAlign: 'center' }}>
              Run not found.
            </div>
          )
        )}
      </div>
    </div>
  )
}

// --- progress bar ---
function ProgressBar({ pct, step, total, done }: { pct: number; step: number; total: number; done: boolean }) {
  return (
    <div>
      <div style={{ height: '4px', borderRadius: '2px', background: 'var(--sf2)', overflow: 'hidden', marginBottom: '4px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: done ? 'var(--pos)' : 'var(--accent)', transition: 'width 0.2s ease' }} />
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)', textAlign: 'right' }}>
        {total > 0 ? `${step} / ${total} steps` : 'Starting…'}
      </div>
    </div>
  )
}

// --- decision feed (shared between live stream and static detail) ---
interface DecisionItem {
  action: string; coin: string; size: number; confidence: number; reasoning: string; timestamp: string
  executed?: boolean
  blockedReason?: string
  executedSize?: number
}

function DecisionFeed({
  items, feedRef, expanded, onExpand, live,
}: {
  items: DecisionItem[]
  feedRef?: React.RefObject<HTMLDivElement>
  expanded: number | null
  onExpand: (i: number | null) => void
  live?: boolean
}) {
  return (
    <div>
      <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
        {live ? 'Live decisions' : `Decisions (${items.length})`}
      </div>
      <div ref={feedRef} style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)' }}>
        {items.length === 0 ? (
          <div style={{ padding: '12px', color: 'var(--muted)', fontSize: '11px', textAlign: 'center' }}>
            Waiting for first decision…
          </div>
        ) : items.map((d, i) => {
          const action = d.action.toLowerCase()
          const color = ACTION_COLOR[action] ?? 'var(--muted)'
          const isOpen = expanded === i
          const dt = new Date(d.timestamp)
          const label = `${fmtDate(dt)} ${fmtTime(dt)}`
          // Outcome: hold = neutral; non-hold with executed=false = blocked; executed=true = filled.
          // Old runs (pre-feature) have executed=undefined — render without a badge.
          const isBlocked = action !== 'hold' && d.executed === false
          const isFilled = action !== 'hold' && d.executed === true
          const sizeShown = isFilled && d.executedSize !== undefined ? d.executedSize : d.size
          const sizeWasResized = isFilled && d.executedSize !== undefined && d.executedSize !== d.size
          return (
            <div key={i} onClick={() => onExpand(isOpen ? null : i)} style={{
              padding: '6px 10px', borderLeft: `3px solid ${color}`, cursor: 'pointer',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
              background: isOpen
                ? 'var(--sf2)'
                : isBlocked ? 'color-mix(in srgb, var(--neg) 6%, transparent)' : 'transparent',
              opacity: isBlocked ? 0.85 : 1,
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', fontFamily: 'monospace', fontSize: '11px' }}>
                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
                <span style={{ color, fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>{d.action}</span>
                {action !== 'hold' && <span style={{ color: 'var(--fg)', flexShrink: 0 }}>{d.coin}</span>}
                {action !== 'hold' && sizeShown > 0 && (
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                    ${sizeShown.toFixed(sizeShown >= 100 ? 0 : 2)}
                    {sizeWasResized && (
                      <span style={{ opacity: 0.6, marginLeft: '4px', textDecoration: 'line-through' }}>${d.size}</span>
                    )}
                  </span>
                )}
                {isFilled && (
                  <span style={{
                    fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em',
                    padding: '1px 5px', borderRadius: '3px',
                    background: 'color-mix(in srgb, var(--pos) 18%, transparent)',
                    color: 'var(--pos)', flexShrink: 0,
                  }}>FILLED</span>
                )}
                {isBlocked && (
                  <span style={{
                    fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em',
                    padding: '1px 5px', borderRadius: '3px',
                    background: 'color-mix(in srgb, var(--neg) 18%, transparent)',
                    color: 'var(--neg)', flexShrink: 0,
                  }}>BLOCKED</span>
                )}
                <span style={{ color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>{(d.confidence * 100).toFixed(0)}%</span>
              </div>
              {isBlocked && d.blockedReason && !isOpen && (
                <div style={{ marginTop: '3px', color: 'var(--neg)', opacity: 0.85, fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.blockedReason}
                </div>
              )}
              {isOpen && (
                <div style={{ marginTop: '4px', color: 'var(--muted)', fontSize: '10.5px', lineHeight: 1.5, fontFamily: 'monospace' }}>
                  {isBlocked && d.blockedReason && (
                    <div style={{ color: 'var(--neg)', marginBottom: '4px' }}>blocked: {d.blockedReason}</div>
                  )}
                  {d.reasoning}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- run detail ---
function RunDetail({ run, onRerun }: { run: BacktestRunDetail; onRerun: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const il = intervalLabel(run.intervalMs)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ color: 'var(--accent)' }}>{run.id.slice(0, 8)}</span>
          <span>{fmtDateLong(run.from)} → {fmtDateLong(run.to)}</span>
          <span>{run.model}</span>
          <span>{il} interval</span>
          <span>created {fmtDateLong(run.createdAt)}</span>
        </div>
        <button onClick={onRerun} style={{
          padding: '4px 10px', borderRadius: 'var(--r)',
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--muted)', cursor: 'pointer', fontSize: '11px',
          fontFamily: 'monospace', flexShrink: 0,
        }}>
          ↺ Rerun
        </button>
      </div>

      {run.status === 'error' && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--r)',
          background: 'color-mix(in srgb, var(--neg) 10%, transparent)',
          border: '1px solid var(--neg)', color: 'var(--neg)',
          fontFamily: 'monospace', fontSize: '12px',
        }}>
          {run.errorMessage ?? 'Unknown error'}
          {run.decisions && run.decisions.length > 0 && (
            <span style={{ color: 'var(--muted)', marginLeft: '8px' }}>
              · {run.decisions.length} decisions before cancel
            </span>
          )}
        </div>
      )}

      {run.stats && run.trades && run.pnlCurve && (
        <BacktestResults result={{ stats: run.stats, trades: run.trades, pnlCurve: run.pnlCurve } as any} />
      )}

      {run.decisions && run.decisions.length > 0 && (
        <DecisionFeed
          items={run.decisions.map(d => ({ ...d }))}
          expanded={expanded}
          onExpand={setExpanded}
        />
      )}
    </div>
  )
}
