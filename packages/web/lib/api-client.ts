/**
 * Typed client for the NestJS API (`packages/api`).
 *
 * Domain types are imported from the API's shared `common` folder so the two
 * packages cannot drift. API response envelopes (run summaries, decisions)
 * are declared here — they mirror the controller return shapes.
 */
import type {
  Trade,
  Signal,
  LLMDecision,
  BotSettings,
  BacktestStats,
  BacktestTrade,
  PnlPoint,
  BacktestResult,
} from '@api/common'

export type { Trade, Signal, BotSettings, BacktestResult }

/** A persisted decision row — mirrors the API's StoredDecision. */
export interface StoredDecision extends LLMDecision {
  id: string
  status: 'executed' | 'blocked' | 'pending' | 'approved' | 'rejected'
  blockedReason: string | null
  expiresAt: string | null
  decidedAt: string
}

/** Base URL of the API. Configurable for non-local deployments. */
export const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_URL'] ?? 'http://127.0.0.1:4000'

// --- API response shapes (mirror the controllers / repositories) ------------

export interface StepDecision {
  timestamp: string
  action: string
  coin: string
  size: number
  confidence: number
  reasoning: string
  executed?: boolean
  blockedReason?: string
  executedSize?: number
}

export interface BacktestRunSummary {
  id: string
  createdAt: string
  from: string
  to: string
  coins: string[]
  model: string
  intervalMs: number
  initialCapital: number
  status: string
  stats: BacktestStats | null
  errorMessage: string | null
}

export interface BacktestRunDetail extends BacktestRunSummary {
  trades: BacktestTrade[]
  pnlCurve: PnlPoint[]
  decisions: StepDecision[]
}

// --- core request helper ----------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    // Always hit the API fresh — this data is live.
    cache: 'no-store',
  })
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText)
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${message}`)
  }
  return res.json() as Promise<T>
}

// --- endpoints --------------------------------------------------------------

export const api = {
  /** Open positions. */
  getPositions: () => request<Trade[]>('/positions'),

  /** Recent trades (most recent first). */
  getTrades: (limit = 100) => request<Trade[]>(`/trades?limit=${limit}`),

  /** Recent decisions (most recent first). */
  getDecisions: (limit = 20) => request<StoredDecision[]>(`/decisions?limit=${limit}`),

  /** The decision currently awaiting approval, or null. */
  getPendingDecision: () =>
    request<StoredDecision | null>('/decisions/pending'),

  /** Signals from the last `sinceMs` milliseconds (default 24h). */
  getSignals: (sinceMs = 24 * 60 * 60 * 1000) =>
    request<Signal[]>(`/signals?sinceMs=${sinceMs}`),

  /** Generic BotState value read (e.g. `fearAndGreed`). */
  getBotState: <T = unknown>(key: string) =>
    request<{ value: T }>(`/bot/state/${key}`).then(r => r.value),

  /** Approve or reject a pending decision. */
  updateDecision: (id: string, status: 'approved' | 'rejected') =>
    request<{ ok: true }>(`/decisions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  /** Persisted backtest runs (most recent first). */
  getBacktestRuns: () => request<BacktestRunSummary[]>('/backtest/runs'),

  /** A single backtest run with trades, pnl curve and decisions. */
  getBacktestRun: (id: string) => request<BacktestRunDetail>(`/backtest/runs/${id}`),

  /** Available candle date range, or null when no candles are loaded. */
  getCandleRange: () =>
    request<{ from: string; to: string } | null>('/backtest/candle-range'),

  /** Runs a backtest to completion (no streaming). */
  runBacktest: (params: Record<string, unknown>) =>
    request<BacktestResult>('/backtest/runs', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  /** Current runtime bot settings. */
  getSettings: () => request<BotSettings>('/settings'),

  /** Persists bot settings (clamped server-side); returns the saved values. */
  saveSettings: (settings: BotSettings) =>
    request<BotSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /** The shared `paused` flag that gates the live trading loop. */
  getPaused: () => request<{ paused: boolean }>('/bot/paused'),

  /** Sets the `paused` flag. */
  setPaused: (paused: boolean) =>
    request<{ paused: boolean }>('/bot/paused', {
      method: 'PUT',
      body: JSON.stringify({ paused }),
    }),
}

/**
 * Builds the SSE URL for a streaming backtest. Consume with `EventSource`;
 * events carry `data: {"type": "run_created" | "step" | "result" | "error", ...}`.
 */
export function backtestStreamUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return `${API_BASE_URL}/backtest/stream?${qs}`
}
