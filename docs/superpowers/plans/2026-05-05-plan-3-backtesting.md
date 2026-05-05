# Backtesting Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `backtest` package that replays historical OHLCV + signals through the real LLM adapter and simulates order fills, producing P&L curves and summary statistics.

**Architecture:** A `BacktestRunner.run(config)` method steps through time at configurable intervals, builds a strict no-lookahead `WorldSnapshot` at each step, calls the real `LLMAdapter.decide()`, simulates fills at the next candle open, and tracks positions/P&L throughout. Pure helper functions (`historicalSlice`, `getFillPrice`, `calculateStats`) handle the data-slicing, fill simulation, and statistics independently so they can be tested in isolation.

**Tech Stack:** TypeScript 5, vitest (tests), `@trader/shared` types, `@trader/llm` (`LLMAdapter`, `TradingContext`), `@trader/data` (`DataSource`), `@trader/core` (`CapitalGuard`)

---

## File Structure

```
packages/backtest/
  src/
    types.ts                  — BacktestConfig, BacktestResult, BacktestTrade, BacktestStats
    historical-slice.ts       — historicalSlice() pure function (no-lookahead WorldSnapshot)
    fill-simulator.ts         — getFillPrice() pure function (next candle open)
    stats-calculator.ts       — calculateStats() pure function (Sharpe, drawdown, win rate)
    backtest-runner.ts        — BacktestRunner class with time-stepping loop
    index.ts                  — re-exports
  tests/
    historical-slice.test.ts
    fill-simulator.test.ts
    stats-calculator.test.ts
    backtest-runner.test.ts
  package.json
  tsconfig.json
```

---

### Task 1: Package scaffold + types

**Files:**
- Create: `packages/backtest/package.json`
- Create: `packages/backtest/tsconfig.json`
- Create: `packages/backtest/src/types.ts`
- Create: `packages/backtest/src/index.ts`
- Modify: `pnpm-workspace.yaml` (already includes `packages/*` glob — no change needed unless explicit listing)

- [ ] **Step 1: Create `packages/backtest/package.json`**

```json
{
  "name": "@trader/backtest",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@trader/shared": "workspace:*",
    "@trader/llm": "workspace:*",
    "@trader/data": "workspace:*",
    "@trader/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/backtest/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/backtest/src/types.ts`**

```typescript
import type { Candle } from '@trader/shared'
import type { LLMAdapter } from '@trader/llm'
import type { DataSource } from '@trader/data'

export interface BacktestConfig {
  from: Date
  to: Date
  initialCapital: number
  autoTradeLimit: number
  coins: string[]
  sources: DataSource[]
  ohlcv: Record<string, Candle[]>
  adapter: LLMAdapter
  intervalMs?: number
}

export interface BacktestTrade {
  coin: string
  side: 'buy' | 'sell'
  size: number
  entryPrice: number
  exitPrice?: number
  openedAt: Date
  closedAt?: Date
  pnl?: number
  reasoning: string
}

export interface BacktestStats {
  totalPnl: number
  winRate: number
  maxDrawdown: number
  sharpeRatio: number
  avgHoldTimeMs: number
  totalTrades: number
}

export interface PnlPoint {
  timestamp: Date
  capital: number
}

export interface BacktestResult {
  trades: BacktestTrade[]
  stats: BacktestStats
  pnlCurve: PnlPoint[]
}
```

- [ ] **Step 4: Create `packages/backtest/src/index.ts`**

```typescript
export type {
  BacktestConfig,
  BacktestTrade,
  BacktestStats,
  PnlPoint,
  BacktestResult,
} from './types.js'
export { historicalSlice } from './historical-slice.js'
export { getFillPrice } from './fill-simulator.js'
export { calculateStats } from './stats-calculator.js'
export { BacktestRunner } from './backtest-runner.js'
```

- [ ] **Step 5: Install dependencies**

```bash
cd /path/to/trader && pnpm install
```

Expected: workspace symlinks resolved, no errors.

- [ ] **Step 6: Build shared first to ensure types resolve**

```bash
cd packages/shared && pnpm build
cd ../llm && pnpm build
cd ../data && pnpm build
cd ../core && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add packages/backtest/
git commit -m "feat(backtest): scaffold package with types"
```

---

### Task 2: `historicalSlice` — no-lookahead WorldSnapshot

**Files:**
- Create: `packages/backtest/src/historical-slice.ts`
- Create: `packages/backtest/tests/historical-slice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backtest/tests/historical-slice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { historicalSlice } from '../src/historical-slice.js'
import type { Signal, Candle } from '@trader/shared'

function makeSignal(source: string, timestamp: Date): Signal {
  return { source, type: 'news', content: 'test', timestamp }
}

function makeCandle(timestamp: Date, close = 100): Candle {
  return { timestamp, open: close, high: close, low: close, close, volume: 1 }
}

const t0 = new Date('2024-01-01T00:00:00Z')
const t1 = new Date('2024-01-01T01:00:00Z')
const t2 = new Date('2024-01-01T02:00:00Z')
const t3 = new Date('2024-01-01T03:00:00Z')

describe('historicalSlice', () => {
  it('includes only signals at or before currentTime', () => {
    const signals: Signal[] = [
      makeSignal('a', t0),
      makeSignal('b', t1),
      makeSignal('c', t3),
    ]
    const ohlcv = { BTC: [makeCandle(t0), makeCandle(t1), makeCandle(t3)] }

    const snapshot = historicalSlice(signals, ohlcv, t2)

    expect(snapshot.signals).toHaveLength(2)
    expect(snapshot.signals.map(s => s.source)).toEqual(expect.arrayContaining(['a', 'b']))
    expect(snapshot.signals.find(s => s.source === 'c')).toBeUndefined()
  })

  it('includes only candles with timestamp before currentTime (strict no-lookahead)', () => {
    const signals: Signal[] = []
    const ohlcv = {
      BTC: [makeCandle(t0), makeCandle(t1), makeCandle(t2), makeCandle(t3)],
    }

    const snapshot = historicalSlice(signals, ohlcv, t2)

    // candles AT currentTime are future data — exclude them
    expect(snapshot.ohlcv['BTC']).toHaveLength(2)
    expect(snapshot.ohlcv['BTC'].map(c => c.timestamp)).toEqual([t0, t1])
  })

  it('sets snapshot timestamp to currentTime', () => {
    const snapshot = historicalSlice([], {}, t1)
    expect(snapshot.timestamp).toEqual(t1)
  })

  it('returns empty signals and empty ohlcv when nothing is before currentTime', () => {
    const signals = [makeSignal('future', t3)]
    const ohlcv = { BTC: [makeCandle(t3)] }

    const snapshot = historicalSlice(signals, ohlcv, t0)

    expect(snapshot.signals).toHaveLength(0)
    expect(snapshot.ohlcv['BTC']).toHaveLength(0)
  })

  it('handles multiple coins independently', () => {
    const signals: Signal[] = []
    const ohlcv = {
      BTC: [makeCandle(t0), makeCandle(t3)],
      ETH: [makeCandle(t1), makeCandle(t3)],
    }

    const snapshot = historicalSlice(signals, ohlcv, t2)

    expect(snapshot.ohlcv['BTC']).toHaveLength(1)
    expect(snapshot.ohlcv['ETH']).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backtest && pnpm test
```

Expected: FAIL — `historicalSlice` not found.

- [ ] **Step 3: Implement `historical-slice.ts`**

Create `packages/backtest/src/historical-slice.ts`:

```typescript
import type { Signal, Candle, WorldSnapshot } from '@trader/shared'

export function historicalSlice(
  allSignals: Signal[],
  ohlcv: Record<string, Candle[]>,
  currentTime: Date,
): WorldSnapshot {
  const cutoff = currentTime.getTime()

  const signals = allSignals.filter(s => s.timestamp.getTime() <= cutoff)

  const slicedOhlcv: Record<string, Candle[]> = {}
  for (const [coin, candles] of Object.entries(ohlcv)) {
    slicedOhlcv[coin] = candles.filter(c => c.timestamp.getTime() < cutoff)
  }

  return { timestamp: currentTime, signals, ohlcv: slicedOhlcv }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/backtest && pnpm test
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backtest/src/historical-slice.ts packages/backtest/tests/historical-slice.test.ts
git commit -m "feat(backtest): historicalSlice with no-lookahead filtering"
```

---

### Task 3: `getFillPrice` — next-candle fill simulation

**Files:**
- Create: `packages/backtest/src/fill-simulator.ts`
- Create: `packages/backtest/tests/fill-simulator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backtest/tests/fill-simulator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getFillPrice } from '../src/fill-simulator.js'
import type { Candle } from '@trader/shared'

function makeCandle(timestamp: Date, open: number): Candle {
  return { timestamp, open, high: open, low: open, close: open, volume: 1 }
}

const t0 = new Date('2024-01-01T00:00:00Z')
const t1 = new Date('2024-01-01T01:00:00Z')
const t2 = new Date('2024-01-01T02:00:00Z')
const t3 = new Date('2024-01-01T03:00:00Z')

describe('getFillPrice', () => {
  it('returns the open price of the first candle strictly after afterTime', () => {
    const candles: Candle[] = [
      makeCandle(t0, 100),
      makeCandle(t1, 105),
      makeCandle(t2, 110),
    ]

    const price = getFillPrice(candles, t0)

    expect(price).toBe(105)
  })

  it('returns undefined when no candle exists after afterTime', () => {
    const candles: Candle[] = [makeCandle(t0, 100), makeCandle(t1, 105)]

    const price = getFillPrice(candles, t1)

    expect(price).toBeUndefined()
  })

  it('returns undefined for empty candle array', () => {
    const price = getFillPrice([], t0)
    expect(price).toBeUndefined()
  })

  it('returns the first candle open when afterTime is before all candles', () => {
    const candles: Candle[] = [makeCandle(t1, 200), makeCandle(t2, 210)]

    const price = getFillPrice(candles, t0)

    expect(price).toBe(200)
  })

  it('uses strictly after (not equal) comparison', () => {
    const candles: Candle[] = [makeCandle(t1, 150), makeCandle(t2, 160)]

    // exactly at t1 — should return t2's open, not t1's
    const price = getFillPrice(candles, t1)

    expect(price).toBe(160)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backtest && pnpm test
```

Expected: FAIL — `getFillPrice` not found.

- [ ] **Step 3: Implement `fill-simulator.ts`**

Create `packages/backtest/src/fill-simulator.ts`:

```typescript
import type { Candle } from '@trader/shared'

export function getFillPrice(candles: Candle[], afterTime: Date): number | undefined {
  const cutoff = afterTime.getTime()
  const next = candles.find(c => c.timestamp.getTime() > cutoff)
  return next?.open
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/backtest && pnpm test
```

Expected: 5 tests PASS (historical-slice + fill-simulator).

- [ ] **Step 5: Commit**

```bash
git add packages/backtest/src/fill-simulator.ts packages/backtest/tests/fill-simulator.test.ts
git commit -m "feat(backtest): getFillPrice fill simulation"
```

---

### Task 4: `calculateStats` — Sharpe, drawdown, win rate

**Files:**
- Create: `packages/backtest/src/stats-calculator.ts`
- Create: `packages/backtest/tests/stats-calculator.test.ts`

The Sharpe ratio here uses daily returns from the P&L curve. With annualisation factor `√252` (trading days). If there are fewer than 2 data points, Sharpe is 0.

- [ ] **Step 1: Write the failing test**

Create `packages/backtest/tests/stats-calculator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateStats } from '../src/stats-calculator.js'
import type { BacktestTrade, PnlPoint } from '../src/types.js'

function makeTrade(
  overrides: Partial<BacktestTrade> & { pnl: number; side?: 'buy' | 'sell' },
): BacktestTrade {
  return {
    coin: 'BTC',
    side: overrides.side ?? 'buy',
    size: 100,
    entryPrice: 50000,
    exitPrice: 50000,
    openedAt: new Date('2024-01-01T00:00:00Z'),
    closedAt: new Date('2024-01-01T01:00:00Z'),
    reasoning: 'test',
    ...overrides,
  }
}

describe('calculateStats', () => {
  it('calculates totalPnl as sum of all trade pnl', () => {
    const trades = [makeTrade({ pnl: 10 }), makeTrade({ pnl: -5 }), makeTrade({ pnl: 20 })]
    const curve: PnlPoint[] = []

    const stats = calculateStats(trades, 1000, curve)

    expect(stats.totalPnl).toBe(25)
  })

  it('calculates winRate as fraction of profitable trades', () => {
    const trades = [
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: 20 }),
      makeTrade({ pnl: -5 }),
      makeTrade({ pnl: 0 }),
    ]

    const stats = calculateStats(trades, 1000, [])

    expect(stats.winRate).toBeCloseTo(0.5) // 2 profitable out of 4
  })

  it('calculates winRate as 0 when no trades', () => {
    const stats = calculateStats([], 1000, [])
    expect(stats.winRate).toBe(0)
  })

  it('calculates maxDrawdown as largest peak-to-trough drop in capital', () => {
    const curve: PnlPoint[] = [
      { timestamp: new Date('2024-01-01'), capital: 1000 },
      { timestamp: new Date('2024-01-02'), capital: 1200 }, // peak
      { timestamp: new Date('2024-01-03'), capital: 900 },  // trough → drawdown = 300
      { timestamp: new Date('2024-01-04'), capital: 1100 },
    ]

    const stats = calculateStats([], 1000, curve)

    expect(stats.maxDrawdown).toBeCloseTo(300)
  })

  it('calculates maxDrawdown as 0 when curve is monotonically increasing', () => {
    const curve: PnlPoint[] = [
      { timestamp: new Date('2024-01-01'), capital: 1000 },
      { timestamp: new Date('2024-01-02'), capital: 1100 },
      { timestamp: new Date('2024-01-03'), capital: 1200 },
    ]

    const stats = calculateStats([], 1000, curve)

    expect(stats.maxDrawdown).toBe(0)
  })

  it('calculates avgHoldTimeMs for closed trades', () => {
    const open = new Date('2024-01-01T00:00:00Z')
    const close1 = new Date('2024-01-01T01:00:00Z') // 1h = 3_600_000ms
    const close2 = new Date('2024-01-01T03:00:00Z') // 3h = 10_800_000ms
    const trades = [
      makeTrade({ pnl: 0, openedAt: open, closedAt: close1 }),
      makeTrade({ pnl: 0, openedAt: open, closedAt: close2 }),
    ]

    const stats = calculateStats(trades, 1000, [])

    expect(stats.avgHoldTimeMs).toBe(7_200_000) // avg of 1h and 3h = 2h
  })

  it('sets avgHoldTimeMs to 0 when no closed trades', () => {
    const trade = makeTrade({ pnl: 10, closedAt: undefined })
    const stats = calculateStats([trade], 1000, [])
    expect(stats.avgHoldTimeMs).toBe(0)
  })

  it('reports totalTrades count', () => {
    const trades = [makeTrade({ pnl: 1 }), makeTrade({ pnl: 2 })]
    const stats = calculateStats(trades, 1000, [])
    expect(stats.totalTrades).toBe(2)
  })

  it('returns sharpeRatio of 0 when fewer than 2 curve points', () => {
    const curve: PnlPoint[] = [{ timestamp: new Date(), capital: 1000 }]
    const stats = calculateStats([], 1000, curve)
    expect(stats.sharpeRatio).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backtest && pnpm test
```

Expected: FAIL — `calculateStats` not found.

- [ ] **Step 3: Implement `stats-calculator.ts`**

Create `packages/backtest/src/stats-calculator.ts`:

```typescript
import type { BacktestTrade, BacktestStats, PnlPoint } from './types.js'

export function calculateStats(
  trades: BacktestTrade[],
  initialCapital: number,
  pnlCurve: PnlPoint[],
): BacktestStats {
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)

  const closedTrades = trades.filter(t => t.closedAt !== undefined)
  const winningTrades = trades.filter(t => (t.pnl ?? 0) > 0)
  const winRate = trades.length === 0 ? 0 : winningTrades.length / trades.length

  const maxDrawdown = computeMaxDrawdown(pnlCurve)

  const avgHoldTimeMs =
    closedTrades.length === 0
      ? 0
      : closedTrades.reduce((sum, t) => sum + (t.closedAt!.getTime() - t.openedAt.getTime()), 0) /
        closedTrades.length

  const sharpeRatio = computeSharpe(pnlCurve, initialCapital)

  return {
    totalPnl,
    winRate,
    maxDrawdown,
    sharpeRatio,
    avgHoldTimeMs,
    totalTrades: trades.length,
  }
}

function computeMaxDrawdown(curve: PnlPoint[]): number {
  let peak = -Infinity
  let maxDD = 0
  for (const point of curve) {
    if (point.capital > peak) peak = point.capital
    const dd = peak - point.capital
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

function computeSharpe(curve: PnlPoint[], initialCapital: number): number {
  if (curve.length < 2) return 0
  const returns: number[] = []
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].capital
    if (prev === 0) continue
    returns.push((curve[i].capital - prev) / prev)
  }
  if (returns.length === 0) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return 0
  return (mean / stdDev) * Math.sqrt(252)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/backtest && pnpm test
```

Expected: all tests PASS (historical-slice + fill-simulator + stats-calculator).

- [ ] **Step 5: Commit**

```bash
git add packages/backtest/src/stats-calculator.ts packages/backtest/tests/stats-calculator.test.ts
git commit -m "feat(backtest): calculateStats with Sharpe, drawdown, win rate"
```

---

### Task 5: `BacktestRunner` — time-stepping simulation loop

**Files:**
- Create: `packages/backtest/src/backtest-runner.ts`
- Create: `packages/backtest/tests/backtest-runner.test.ts`

The runner:
1. Fetches all historical signals from all sources upfront (using `fetchHistorical`)
2. Steps from `config.from` to `config.to` in `intervalMs` increments
3. At each step, calls `historicalSlice` to build `WorldSnapshot`
4. Builds `TradingContext` and calls `adapter.decide()`
5. On `buy`/`sell` with `size > 0`: simulates fill via `getFillPrice`, records trade
6. On `hold` or unfillable: skips
7. Tracks open positions naively (buy opens, sell closes the matching coin's most recent open position)
8. Records `PnlPoint` at each step
9. Returns `BacktestResult`

- [ ] **Step 1: Write the failing test**

Create `packages/backtest/tests/backtest-runner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { BacktestRunner } from '../src/backtest-runner.js'
import type { BacktestConfig } from '../src/types.js'
import type { LLMDecision, TradingContext } from '@trader/llm'
import type { Candle } from '@trader/shared'
import type { DataSource } from '@trader/data'

function makeCandle(timestamp: Date, open: number, close = open): Candle {
  return { timestamp, open, high: open, low: open, close, volume: 1 }
}

const t0 = new Date('2024-01-01T00:00:00Z')
const t1 = new Date('2024-01-01T00:15:00Z')
const t2 = new Date('2024-01-01T00:30:00Z')
const t3 = new Date('2024-01-01T00:45:00Z')

function makeNullSource(): DataSource {
  return {
    id: 'null',
    fetch: async () => [],
    fetchHistorical: async () => [],
  }
}

describe('BacktestRunner', () => {
  it('returns empty trades when adapter always returns hold', async () => {
    const adapter = { decide: vi.fn(async (): Promise<LLMDecision> => ({
      action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold'
    })) }

    const config: BacktestConfig = {
      from: t0,
      to: t2,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 110), makeCandle(t2, 120)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades).toHaveLength(0)
    expect(adapter.decide).toHaveBeenCalled()
  })

  it('records a buy trade when adapter returns buy', async () => {
    let callCount = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) {
          return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'bullish' }
        }
        return { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
      }),
    }

    const config: BacktestConfig = {
      from: t0,
      to: t2,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 110), makeCandle(t2, 120)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades.length).toBeGreaterThanOrEqual(1)
    const buyTrade = result.trades.find(t => t.side === 'buy')
    expect(buyTrade).toBeDefined()
    expect(buyTrade!.coin).toBe('BTC')
    expect(buyTrade!.entryPrice).toBe(110) // fills at next candle open after t0
  })

  it('closes position when adapter returns sell after buy', async () => {
    let callCount = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) {
          return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy' }
        }
        if (callCount === 2) {
          return { action: 'sell', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'sell' }
        }
        return { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
      }),
    }

    const config: BacktestConfig = {
      from: t0,
      to: t3,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: {
        BTC: [
          makeCandle(t0, 100),
          makeCandle(t1, 110),
          makeCandle(t2, 120),
          makeCandle(t3, 130),
        ],
      },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    const buyTrade = result.trades.find(t => t.side === 'buy' && t.closedAt !== undefined)
    expect(buyTrade).toBeDefined()
    expect(buyTrade!.exitPrice).toBeDefined()
    expect(buyTrade!.pnl).toBeDefined()
  })

  it('produces a pnlCurve with one point per step', async () => {
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => ({
        action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold',
      })),
    }

    const config: BacktestConfig = {
      from: t0,
      to: t2,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 110), makeCandle(t2, 120)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    // from=t0, to=t2, interval=15min → steps at t0 and t1 (t2 is exclusive)
    expect(result.pnlCurve.length).toBeGreaterThanOrEqual(1)
  })

  it('skips buy when no fill price is available', async () => {
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => ({
        action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy',
      })),
    }

    // Only one candle — no "next" candle to fill at
    const config: BacktestConfig = {
      from: t0,
      to: t1,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backtest && pnpm test
```

Expected: FAIL — `BacktestRunner` not found.

- [ ] **Step 3: Implement `backtest-runner.ts`**

Create `packages/backtest/src/backtest-runner.ts`:

```typescript
import type { Signal } from '@trader/shared'
import type { TradingContext } from '@trader/llm'
import { historicalSlice } from './historical-slice.js'
import { getFillPrice } from './fill-simulator.js'
import { calculateStats } from './stats-calculator.js'
import type { BacktestConfig, BacktestResult, BacktestTrade, PnlPoint } from './types.js'

interface OpenPosition {
  trade: BacktestTrade
}

export class BacktestRunner {
  constructor(private readonly config: BacktestConfig) {}

  async run(): Promise<BacktestResult> {
    const { from, to, initialCapital, coins, sources, ohlcv, adapter } = this.config
    const intervalMs = this.config.intervalMs ?? 15 * 60 * 1000

    // fetch all historical signals upfront
    const allSignals: Signal[] = []
    await Promise.allSettled(
      sources.map(async source => {
        const signals = await source.fetchHistorical(from, to)
        allSignals.push(...signals)
      }),
    )

    const trades: BacktestTrade[] = []
    const pnlCurve: PnlPoint[] = []
    const openPositions: OpenPosition[] = []
    let capital = initialCapital

    let current = from.getTime()
    const end = to.getTime()

    while (current < end) {
      const currentTime = new Date(current)
      const snapshot = historicalSlice(allSignals, ohlcv, currentTime)

      const closedTrades = trades.filter(t => t.closedAt !== undefined)
      const openTrades = trades.filter(t => t.closedAt === undefined)

      const context: TradingContext = {
        snapshot,
        positions: openPositions.map(p => ({
          coin: p.trade.coin,
          size: p.trade.size,
          entryPrice: p.trade.entryPrice,
          currentPrice:
            ohlcv[p.trade.coin]?.findLast(c => c.timestamp.getTime() <= current)?.close ??
            p.trade.entryPrice,
          openedAt: p.trade.openedAt,
        })),
        availableCapital: capital,
        recentTrades: closedTrades.slice(-5).map(t => ({
          id: t.openedAt.toISOString() + t.coin,
          coin: t.coin,
          side: t.side,
          size: t.size,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
          pnl: t.pnl,
          reasoning: t.reasoning,
        })),
        openOrders: [],
      }

      const decision = await adapter.decide(context)

      if (decision.action === 'buy' && decision.size > 0 && capital >= decision.size) {
        const fillPrice = getFillPrice(ohlcv[decision.coin] ?? [], currentTime)
        if (fillPrice !== undefined) {
          const trade: BacktestTrade = {
            coin: decision.coin,
            side: 'buy',
            size: decision.size,
            entryPrice: fillPrice,
            openedAt: currentTime,
            reasoning: decision.reasoning,
          }
          capital -= decision.size
          trades.push(trade)
          openPositions.push({ trade })
        }
      } else if (decision.action === 'sell' && decision.size > 0) {
        const posIndex = openPositions.findLastIndex(p => p.trade.coin === decision.coin)
        if (posIndex !== -1) {
          const fillPrice = getFillPrice(ohlcv[decision.coin] ?? [], currentTime)
          if (fillPrice !== undefined) {
            const pos = openPositions[posIndex]
            const unitsHeld = pos.trade.size / pos.trade.entryPrice
            const proceeds = unitsHeld * fillPrice
            pos.trade.exitPrice = fillPrice
            pos.trade.closedAt = currentTime
            pos.trade.pnl = proceeds - pos.trade.size
            capital += proceeds
            openPositions.splice(posIndex, 1)
          }
        }
      }

      pnlCurve.push({ timestamp: currentTime, capital })
      current += intervalMs
    }

    // close any remaining open positions at last known price
    for (const pos of openPositions) {
      const lastCandle = ohlcv[pos.trade.coin]?.at(-1)
      if (lastCandle) {
        pos.trade.exitPrice = lastCandle.close
        pos.trade.closedAt = new Date(end)
        const unitsHeld = pos.trade.size / pos.trade.entryPrice
        pos.trade.pnl = unitsHeld * lastCandle.close - pos.trade.size
      }
    }

    const stats = calculateStats(trades, initialCapital, pnlCurve)
    return { trades, stats, pnlCurve }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/backtest && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backtest/src/backtest-runner.ts packages/backtest/tests/backtest-runner.test.ts
git commit -m "feat(backtest): BacktestRunner time-stepping simulation loop"
```

---

### Task 6: Build + index + integration smoke test

**Files:**
- Modify: `packages/backtest/src/index.ts` (ensure all exports are wired)
- Modify: `vitest.config.ts` (root — add `@trader/backtest` alias)
- Create: `packages/backtest/tests/integration.test.ts`

- [ ] **Step 1: Verify `index.ts` exports all public symbols**

`packages/backtest/src/index.ts` should already contain (from Task 1):

```typescript
export type {
  BacktestConfig,
  BacktestTrade,
  BacktestStats,
  PnlPoint,
  BacktestResult,
} from './types.js'
export { historicalSlice } from './historical-slice.js'
export { getFillPrice } from './fill-simulator.js'
export { calculateStats } from './stats-calculator.js'
export { BacktestRunner } from './backtest-runner.js'
```

If any are missing, add them now.

- [ ] **Step 2: Add `@trader/backtest` alias to root `vitest.config.ts`**

The current `vitest.config.ts` looks like:

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@trader/core': resolve(__dirname, './packages/core/dist'),
      '@trader/data': resolve(__dirname, './packages/data/dist'),
      '@trader/shared': resolve(__dirname, './packages/shared/dist'),
      '@trader/llm': resolve(__dirname, './packages/llm/dist'),
    },
  },
  test: {
    globals: true,
  },
})
```

Add the backtest alias:

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@trader/core': resolve(__dirname, './packages/core/dist'),
      '@trader/data': resolve(__dirname, './packages/data/dist'),
      '@trader/shared': resolve(__dirname, './packages/shared/dist'),
      '@trader/llm': resolve(__dirname, './packages/llm/dist'),
      '@trader/backtest': resolve(__dirname, './packages/backtest/dist'),
    },
  },
  test: {
    globals: true,
  },
})
```

- [ ] **Step 3: Write the integration smoke test**

Create `packages/backtest/tests/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { BacktestRunner } from '../src/backtest-runner.js'
import type { BacktestConfig } from '../src/types.js'
import type { LLMDecision } from '@trader/llm'
import type { Candle } from '@trader/shared'

function makeCandle(timestamp: Date, open: number): Candle {
  return { timestamp, open, high: open * 1.01, low: open * 0.99, close: open * 1.005, volume: 100 }
}

describe('BacktestRunner integration', () => {
  it('runs a complete backtest and returns valid stats', async () => {
    // 4 hours of 15-min candles for BTC
    const candles: Candle[] = []
    const base = new Date('2024-01-01T00:00:00Z')
    for (let i = 0; i < 16; i++) {
      candles.push(makeCandle(new Date(base.getTime() + i * 15 * 60 * 1000), 50000 + i * 100))
    }

    let callCount = 0
    const adapter = {
      decide: async (): Promise<LLMDecision> => {
        callCount++
        // buy on step 1, sell on step 3, hold otherwise
        if (callCount === 1) return { action: 'buy', coin: 'BTC', size: 200, confidence: 0.8, reasoning: 'test buy' }
        if (callCount === 3) return { action: 'sell', coin: 'BTC', size: 200, confidence: 0.8, reasoning: 'test sell' }
        return { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
      },
    }

    const from = base
    const to = new Date(base.getTime() + 4 * 60 * 60 * 1000) // 4 hours later

    const config: BacktestConfig = {
      from,
      to,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [],
      ohlcv: { BTC: candles },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.pnlCurve.length).toBeGreaterThan(0)
    expect(result.stats.totalTrades).toBe(result.trades.length)
    expect(result.stats.winRate).toBeGreaterThanOrEqual(0)
    expect(result.stats.winRate).toBeLessThanOrEqual(1)
    expect(result.stats.maxDrawdown).toBeGreaterThanOrEqual(0)
    expect(result.pnlCurve[0].capital).toBe(1000)
  })
})
```

- [ ] **Step 4: Run all backtest tests**

```bash
cd packages/backtest && pnpm test
```

Expected: all tests PASS including integration.

- [ ] **Step 5: Build the backtest package**

```bash
cd packages/backtest && pnpm build
```

Expected: `dist/` created with `.js` and `.d.ts` files.

- [ ] **Step 6: Run the full workspace test suite to confirm no regressions**

```bash
cd /path/to/trader && pnpm --filter '@trader/shared' build && pnpm --filter '@trader/core' build && pnpm --filter '@trader/data' build && pnpm --filter '@trader/llm' build && pnpm --filter '@trader/backtest' build
pnpm --filter './packages/**' test
```

Expected: all packages pass, no regressions in core/data/llm/shared.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts packages/backtest/tests/integration.test.ts
git commit -m "feat(backtest): integration smoke test + vitest alias"
```
