# Spec: Backtest Live Streaming (Progress + Decision Feed)

## Problem Statement

How might we give the user meaningful feedback while a backtest runs — and surface
the LLM's decision-making in real time — without making them stare at a spinner?

## Chosen Direction

**SSE Route + Callback.** Add an `onStep` callback to `BacktestRunner`, expose a
`/api/backtest/stream` Next.js route that returns a `ReadableStream` (Server-Sent
Events). The runner emits each decision as a newline-delimited JSON chunk. The
client subscribes with `EventSource`. The final SSE event delivers the full
`BacktestResult`.

The form submit handler is replaced with a `fetch()` call that opens the SSE
stream; `useFormState` is removed in favour of local React state.

## User Experience

### During the run

```
┌─────────────────────────────────────────────────────┐
│ [██████████████░░░░░░░░░░░░░░░] 847 / 2,880 steps   │
│                                                     │
│ Live Decisions                                      │
│ ┌───────────────────────────────────────────────┐  │
│ │ 2025-01-03 12:00  BUY  BTC/USDT  $200  0.82   │  │
│ │   "RSI oversold, volume spike on 1h candle"   │  │
│ │ 2025-01-03 13:00  HOLD            conf 0.61   │  │
│ │ 2025-01-03 16:00  SELL BTC/USDT  +$12  0.77   │  │
│ └─ auto-scrolls to latest ─────────────────────┘  │
│                                                     │
│ [Cancel]                                            │
└─────────────────────────────────────────────────────┘
```

### After completion

Progress bar fills to 100%, live feed stops, stats cards + P&L chart render below.
Cancel button disappears.

## Architecture

### New SSE route: `packages/web/app/api/backtest/stream/route.ts`

- Accepts `GET` with query params: `from`, `to`, `coins`, `model`, `intervalMs`,
  `initialCapital`
- Returns `Response` with `Content-Type: text/event-stream`
- Instantiates `BacktestRunner` with an `onStep` callback
- Each callback invocation writes a `data: <json>\n\n` chunk to the stream
- Final write: `data: {"type":"result", ...fullBacktestResult}\n\n`
- Stream closes naturally when `runner.run()` resolves

### SSE event shapes

```ts
// emitted on every step
type StepEvent = {
  type: 'step'
  step: number        // 1-based
  total: number
  timestamp: string   // ISO — the simulated time
  decision: {
    action: 'buy' | 'sell' | 'hold'
    coin: string
    size: number
    confidence: number
    reasoning: string
  }
  pnl?: number        // only set on sell steps
}

// emitted once at the end
type ResultEvent = {
  type: 'result'
  result: BacktestResult
}

// emitted on error
type ErrorEvent = {
  type: 'error'
  message: string
}
```

### BacktestRunner change: `packages/backtest/src/backtest-runner.ts`

Add optional `onStep` to `BacktestConfig`:

```ts
onStep?: (step: number, total: number, timestamp: Date, decision: LLMDecision) => void
```

Call after each `adapter.decide()` inside the loop. Total steps =
`Math.ceil((to - from) / intervalMs)`.

### Client change: `packages/web/app/backtest/backtest-client.tsx`

- Remove `useFormState` / server action wiring for the run
- On submit: open `EventSource` (or `fetch` with `ReadableStream`) to
  `/api/backtest/stream?...`
- State: `status: 'idle' | 'running' | 'done' | 'error'`, `steps`, `total`,
  `decisions[]`, `result`
- Progress bar: `steps / total * 100`
- Decision feed: last N decisions, auto-scroll, buy=green/sell=orange/hold=muted
- Cancel: `eventSource.close()` → status back to idle

## Key Assumptions

- [ ] `BacktestRunner`'s single `while` loop accepts an `onStep` callback without
  restructuring — confirmed by reading the code; callback drops in after
  `adapter.decide()` on line 80
- [ ] Next.js 14 App Router `GET` route returning `ReadableStream` works with
  `EventSource` from a client component — well-documented pattern, no flags needed
- [ ] LLM API keys are available server-side in the route handler (same as current
  server action) — yes, `process.env` is available in route handlers

## Not Doing

- **WebSockets** — SSE is sufficient for one-way server→client streaming
- **Persisting backtest runs to DB** — adds scope; not needed for single-user tool
- **Real-time P&L chart update** — mid-run chart is noisy; full curve at the end
- **Resumable / shareable runs** — out of scope
- **Streaming server action (experimental)** — unstable Next.js 14 API

## Success Criteria

1. Submit triggers an SSE stream; progress bar appears within 1 second
2. Each LLM decision appears in the feed within 100ms of the runner processing it
3. Full stats + chart render when the stream closes (type=result event)
4. Cancel button closes the stream cleanly; form returns to idle state
5. If stream errors, an inline error message appears (same style as today)
6. `pnpm typecheck` passes across all packages
