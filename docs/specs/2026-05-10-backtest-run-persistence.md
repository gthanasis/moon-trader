# Spec: Backtest Run Persistence & History UI

## Objective

Every backtest run gets a unique ID, is persisted to the DB (including all step
decisions), and is browsable via an admin UI. The run ID can be shared so the
bot's reasoning can be analyzed and used to improve strategy.

## Data Model

New `BacktestRun` Prisma model (no separate decisions table — all decisions
stored as JSONB array in the run row to avoid 2,880+ individual row inserts):

```prisma
model BacktestRun {
  id             String    @id @default(cuid())
  createdAt      DateTime  @default(now())
  from           DateTime
  to             DateTime
  coins          String[]
  model          String
  intervalMs     Int
  initialCapital Float
  status         String    @default("running") // running | done | error
  stats          Json?     // BacktestStats
  trades         Json?     // BacktestTrade[]
  pnlCurve       Json?     // PnlPoint[]
  decisions      Json?     // StepDecision[] — all step decisions in order
  errorMessage   String?

  @@index([createdAt])
  @@index([status])
}
```

`StepDecision` shape stored in the `decisions` JSONB column:
```ts
{ timestamp: string; action: string; coin: string; size: number;
  confidence: number; reasoning: string }
```

## Architecture

### Flow

1. `GET /api/backtest/stream` creates a `BacktestRun` row (status=`running`)
   immediately and emits `{ type: 'run_created', runId }` as the first SSE event
2. Decisions accumulate in-memory during the run (not written per-step)
3. On completion: update row — set `status='done'`, write `stats`, `trades`,
   `pnlCurve`, `decisions`
4. On error: update row — set `status='error'`, write `errorMessage`

### New repository: `BacktestRunRepository`

```ts
create(config): Promise<string>           // returns runId
complete(id, result, decisions): Promise<void>
fail(id, message): Promise<void>
findAll(limit): Promise<BacktestRunSummary[]>
findById(id): Promise<BacktestRunDetail | null>
```

`BacktestRunSummary` = all scalar fields + stats (no trades/pnlCurve/decisions).
`BacktestRunDetail` = full row including trades, pnlCurve, decisions.

### New API routes

- `GET /api/backtest/runs` — returns `BacktestRunSummary[]`, latest first
- `GET /api/backtest/runs/[id]` — returns `BacktestRunDetail`

### New web pages

- `/backtest/runs` — run list (server component, fetches from API)
- `/backtest/runs/[id]` — run detail (server component, fetches by ID)

### Client update (`backtest-client.tsx`)

- On receiving `run_created` SSE event: store `runId` in state
- After run completes: show `"View saved run →"` link to `/backtest/runs/[runId]`

## UI Sketches

### `/backtest/runs` list

```
Backtest Runs

ID          Date        Range              Model         Status   P&L
cm3abc...   May 10      2025-01 → 2025-04  gpt-4o-mini   done     +$142
cm3xyz...   May 10      2025-01 → 2025-02  gpt-4o        error    —
cm3def...   May 9       2025-03 → 2025-04  gpt-4o-mini   done     -$38
```

Each row links to `/backtest/runs/[id]`.

### `/backtest/runs/[id]` detail

```
Run cm3abc... · 2025-01-01 → 2025-04-30 · gpt-4o-mini · 1h

[stats cards — Total P&L, Win Rate, Trades, Drawdown, Sharpe, Hold Time]

[P&L chart]

Decisions (2,880)
┌─────────────────────────────────────────────────────┐
│ Jan 01 00:00  HOLD   BTC/USDT  conf 61%             │
│ Jan 01 01:00  BUY    BTC/USDT  $200  conf 82%       │
│   "RSI oversold, volume spike..."                   │
│ ...                                                  │
└─────────────────────────────────────────────────────┘
```

Decisions list is the same clickable/expandable feed component from the live UI.

## Success Criteria

1. Every completed backtest has a row in `BacktestRun` with status=`done`
2. `runId` appears in browser after run completes with a link to the detail page
3. `/backtest/runs` lists all runs, newest first
4. `/backtest/runs/[id]` renders full stats, chart, and all decisions
5. A failed run has status=`error` and shows the error message on its detail page
6. `pnpm typecheck` passes; `pnpm test` no new failures

## Not Doing

- Pagination on the runs list (latest 50 is fine for now)
- Deleting runs from UI
- Comparing two runs side-by-side
- Re-running a saved run config
