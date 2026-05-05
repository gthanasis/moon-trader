# Live Binance Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real Binance OHLCV price data and live order execution into the existing engine, and add a scheduler that runs the EvaluationCycle on a cron interval.

**Architecture:** Three layers: (1) `OhlcvSource` interface added to `packages/data` so the Pipeline can populate `WorldSnapshot.ohlcv` with real candles from Binance via an injected ccxt-shaped interface; (2) `ExchangeAdapter` interface added to `packages/core` so `OrderManager` can place real market orders without a hard dependency on ccxt; (3) new `packages/runner` that is the only layer which imports ccxt and node-cron directly, wiring everything together from environment variables and exposing a `startLiveTrader()` entry point. Neither the data nor core packages import ccxt — they use structural typing so tests use plain mock objects.

**Tech Stack:** ccxt ^4 (exchange API abstraction), node-cron ^3 (scheduler), TypeScript structural typing (no class mocks needed), vitest

---

## File Structure

```
packages/data/
  src/
    sources/
      ohlcv-base.ts     — OhlcvSource interface
      binance.ts        — BinanceSource implements DataSource + OhlcvSource
    pipeline.ts         — MODIFIED: accept ohlcvSource, populate snapshot.ohlcv
    index.ts            — MODIFIED: export OhlcvSource, BinanceSource
  tests/
    pipeline.test.ts    — MODIFIED: add ohlcv tests
    sources/
      binance.test.ts   — new

packages/llm/
  src/
    prompt-builder.ts   — MODIFIED: add ## Price Data section to user prompt
  tests/
    prompt-builder.test.ts — MODIFIED: add ohlcv test

packages/core/
  src/
    exchange-adapter.ts — ExchangeAdapter interface + CcxtExchangeAdapter
    order-manager.ts    — MODIFIED: accept optional ExchangeAdapter, live order placement
    trading-engine.ts   — MODIFIED: pass currentPrice on sell, accept exchange in config
    index.ts            — MODIFIED: export ExchangeAdapter, CcxtExchangeAdapter
  tests/
    exchange-adapter.test.ts  — new
    order-manager.test.ts     — MODIFIED: add live mode tests
    trading-engine.test.ts    — MODIFIED: add sell with exchange test

packages/runner/  (new)
  src/
    config.ts           — loadConfig() reads env vars, throws on missing required
    scheduler.ts        — Scheduler class wrapping node-cron
    live-runner.ts      — startLiveTrader(config) — only file that imports ccxt
    index.ts            — re-exports
  tests/
    config.test.ts
    scheduler.test.ts
  package.json
  tsconfig.json
```

---

### Task 1: OhlcvSource interface + Pipeline OHLCV support + prompt-builder price section

**Files:**
- Create: `packages/data/src/sources/ohlcv-base.ts`
- Modify: `packages/data/src/pipeline.ts`
- Modify: `packages/data/src/index.ts`
- Modify: `packages/llm/src/prompt-builder.ts`
- Modify: `packages/data/tests/pipeline.test.ts`
- Modify: `packages/llm/tests/prompt-builder.test.ts`

- [ ] **Step 1: Create `packages/data/src/sources/ohlcv-base.ts`**

```typescript
import type { Candle } from '@trader/shared'

export interface OhlcvSource {
  readonly id: string
  fetchOhlcv(
    coins: string[],
    timeframe: string,
    limit: number,
  ): Promise<Record<string, Candle[]>>
}
```

- [ ] **Step 2: Write failing tests for Pipeline OHLCV support**

Add to `packages/data/tests/pipeline.test.ts` (after the existing tests):

```typescript
import type { OhlcvSource } from '../src/sources/ohlcv-base.js'
import type { Candle } from '@trader/shared'

function makeCandle(ts: number): Candle {
  return { timestamp: new Date(ts), open: 1, high: 1, low: 1, close: 1, volume: 1 }
}

describe('Pipeline with ohlcvSource', () => {
  it('populates snapshot.ohlcv from ohlcvSource on fetch()', async () => {
    const ohlcvSource: OhlcvSource = {
      id: 'mock-ohlcv',
      fetchOhlcv: async () => ({ 'BTC/USDT': [makeCandle(1000)] }),
    }
    const pipeline = new Pipeline({
      sources: [],
      ohlcvSource,
      coins: ['BTC/USDT'],
      timeframe: '15m',
      ohlcvLimit: 100,
    })

    const snapshot = await pipeline.fetch()

    expect(snapshot.ohlcv['BTC/USDT']).toHaveLength(1)
    expect(snapshot.ohlcv['BTC/USDT'][0].open).toBe(1)
  })

  it('returns empty ohlcv when no ohlcvSource configured', async () => {
    const pipeline = new Pipeline({ sources: [] })
    const snapshot = await pipeline.fetch()
    expect(snapshot.ohlcv).toEqual({})
  })

  it('returns empty ohlcv when ohlcvSource fetch fails', async () => {
    const ohlcvSource: OhlcvSource = {
      id: 'failing',
      fetchOhlcv: async () => { throw new Error('network error') },
    }
    const pipeline = new Pipeline({
      sources: [],
      ohlcvSource,
      coins: ['BTC/USDT'],
      timeframe: '15m',
      ohlcvLimit: 100,
    })

    const snapshot = await pipeline.fetch()
    expect(snapshot.ohlcv).toEqual({})
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/data && pnpm test
```

Expected: FAIL on 3 new tests (Pipeline doesn't accept ohlcvSource yet).

- [ ] **Step 4: Update `packages/data/src/pipeline.ts`**

Replace the full file:

```typescript
import type { WorldSnapshot, Signal, Candle } from '@trader/shared'
import type { DataSource } from './sources/base.js'
import type { OhlcvSource } from './sources/ohlcv-base.js'

interface PipelineConfig {
  sources: DataSource[]
  ohlcvSource?: OhlcvSource
  coins?: string[]
  timeframe?: string
  ohlcvLimit?: number
}

export class Pipeline {
  private readonly config: PipelineConfig

  constructor(config: PipelineConfig) {
    this.config = config
  }

  async fetch(): Promise<WorldSnapshot> {
    const { sources, ohlcvSource, coins, timeframe = '15m', ohlcvLimit = 100 } = this.config

    const [signalResults, ohlcv] = await Promise.all([
      Promise.allSettled(sources.map(source => source.fetch())),
      ohlcvSource && coins?.length
        ? ohlcvSource.fetchOhlcv(coins, timeframe, ohlcvLimit).catch(() => ({} as Record<string, Candle[]>))
        : Promise.resolve({} as Record<string, Candle[]>),
    ])

    const signals: Signal[] = signalResults
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return { timestamp: new Date(), signals, ohlcv }
  }

  async fetchHistorical(from: Date, to: Date): Promise<WorldSnapshot> {
    const results = await Promise.allSettled(
      this.config.sources.map(source => source.fetchHistorical(from, to))
    )

    const signals: Signal[] = results
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return { timestamp: to, signals, ohlcv: {} }
  }
}
```

- [ ] **Step 5: Run tests to verify Pipeline ohlcv tests pass**

```bash
cd /path/to/trader/packages/data && pnpm test
```

Expected: all data tests PASS (existing + 3 new).

- [ ] **Step 6: Update `packages/data/src/index.ts` to export new types**

```typescript
export type { DataSource } from './sources/base.js'
export type { OhlcvSource } from './sources/ohlcv-base.js'
export { NullDataSource } from './sources/null.js'
export { FearAndGreedSource } from './sources/fear-and-greed.js'
export { CryptoPanicSource } from './sources/cryptopanic.js'
export { Pipeline } from './pipeline.js'
```

- [ ] **Step 7: Write failing test for prompt-builder ohlcv section**

Add to `packages/llm/tests/prompt-builder.test.ts`:

```typescript
  it('includes ohlcv price data when available', () => {
    const context: TradingContext = {
      ...emptyContext,
      snapshot: {
        timestamp: new Date(),
        signals: [],
        ohlcv: {
          'BTC/USDT': [
            { timestamp: new Date('2024-01-01T00:00:00Z'), open: 50000, high: 51000, low: 49500, close: 50500, volume: 1200 },
          ],
        },
      },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('BTC/USDT')
    expect(user).toContain('50000')
  })

  it('shows no price data message when ohlcv is empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No price data')
  })
```

- [ ] **Step 8: Run test to verify it fails**

```bash
cd /path/to/trader/packages/llm && pnpm test
```

Expected: FAIL — prompt doesn't include ohlcv yet.

- [ ] **Step 9: Update `packages/llm/src/prompt-builder.ts` — add Price Data section**

In the `user` template string, after the `## Recent Signals` section, add a `## Price Data` section. Replace the `user` construction:

```typescript
  const ohlcvLines = Object.keys(context.snapshot.ohlcv).length === 0
    ? 'No price data available'
    : Object.entries(context.snapshot.ohlcv)
        .map(([coin, candles]) => {
          const recent = candles.slice(-3)
          const rows = recent
            .map(c => `  ${c.timestamp.toISOString()} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume.toFixed(0)}`)
            .join('\n')
          return `${coin} (last ${recent.length}):\n${rows}`
        })
        .join('\n\n')

  const user = `## Current State
Available capital: $${context.availableCapital.toFixed(2)}

## Open Positions
${positionLines}

## Price Data (recent candles)
${ohlcvLines}

## Recent Signals (most recent first)
${signalLines}

## Recent Trades
${tradeLines}

Analyze the above and submit your trading decision.`
```

- [ ] **Step 10: Run tests to verify all pass**

```bash
cd /path/to/trader/packages/llm && pnpm test
```

Expected: all llm tests PASS (existing + 2 new).

- [ ] **Step 11: Commit**

```bash
git add packages/data/src/sources/ohlcv-base.ts packages/data/src/pipeline.ts packages/data/src/index.ts packages/data/tests/pipeline.test.ts packages/llm/src/prompt-builder.ts packages/llm/tests/prompt-builder.test.ts
git commit -m "feat(data): OhlcvSource interface + Pipeline OHLCV support; feat(llm): add price data section to prompt"
```

---

### Task 2: BinanceSource — ccxt-injected OHLCV data source

**Files:**
- Create: `packages/data/src/sources/binance.ts`
- Modify: `packages/data/src/index.ts`
- Create: `packages/data/tests/sources/binance.test.ts`

The BinanceSource accepts an injected `ExchangeLike` interface (not a ccxt import) so tests can pass a plain mock object. ccxt's `fetchOHLCV` returns an array of `[timestamp_ms, open, high, low, close, volume]` tuples.

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/sources/binance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { BinanceSource } from '../../src/sources/binance.js'

type OhlcvRow = [number, number, number, number, number, number]

function makeMockExchange(rows: Record<string, OhlcvRow[]>) {
  return {
    fetchOHLCV: async (symbol: string): Promise<OhlcvRow[]> => rows[symbol] ?? [],
  }
}

describe('BinanceSource', () => {
  it('maps fetchOHLCV rows to Candle objects', async () => {
    const ts = 1704067200000 // 2024-01-01T00:00:00Z
    const exchange = makeMockExchange({
      'BTC/USDT': [[ts, 50000, 51000, 49500, 50500, 1200]],
    })
    const source = new BinanceSource(exchange)

    const ohlcv = await source.fetchOhlcv(['BTC/USDT'], '15m', 100)

    expect(ohlcv['BTC/USDT']).toHaveLength(1)
    const candle = ohlcv['BTC/USDT'][0]
    expect(candle.timestamp).toEqual(new Date(ts))
    expect(candle.open).toBe(50000)
    expect(candle.high).toBe(51000)
    expect(candle.low).toBe(49500)
    expect(candle.close).toBe(50500)
    expect(candle.volume).toBe(1200)
  })

  it('fetches multiple coins in parallel', async () => {
    const exchange = makeMockExchange({
      'BTC/USDT': [[1000, 50000, 50000, 50000, 50000, 1]],
      'ETH/USDT': [[2000, 3000, 3000, 3000, 3000, 2]],
    })
    const source = new BinanceSource(exchange)

    const ohlcv = await source.fetchOhlcv(['BTC/USDT', 'ETH/USDT'], '15m', 10)

    expect(ohlcv['BTC/USDT']).toHaveLength(1)
    expect(ohlcv['ETH/USDT']).toHaveLength(1)
  })

  it('skips coins that fail to fetch (partial failure tolerance)', async () => {
    let calls = 0
    const exchange = {
      fetchOHLCV: async (symbol: string): Promise<OhlcvRow[]> => {
        calls++
        if (symbol === 'ETH/USDT') throw new Error('rate limited')
        return [[1000, 50000, 50000, 50000, 50000, 1]]
      },
    }
    const source = new BinanceSource(exchange)

    const ohlcv = await source.fetchOhlcv(['BTC/USDT', 'ETH/USDT'], '15m', 10)

    expect(ohlcv['BTC/USDT']).toHaveLength(1)
    expect(ohlcv['ETH/USDT']).toBeUndefined()
    expect(calls).toBe(2)
  })

  it('fetch() returns empty signals (price data is in ohlcv, not signals)', async () => {
    const source = new BinanceSource({ fetchOHLCV: async () => [] })
    const signals = await source.fetch()
    expect(signals).toEqual([])
  })

  it('fetchHistorical() returns empty signals', async () => {
    const source = new BinanceSource({ fetchOHLCV: async () => [] })
    const signals = await source.fetchHistorical(new Date(), new Date())
    expect(signals).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/trader/packages/data && pnpm test
```

Expected: FAIL — `BinanceSource` not found.

- [ ] **Step 3: Create `packages/data/src/sources/binance.ts`**

```typescript
import type { Signal, Candle } from '@trader/shared'
import type { DataSource } from './base.js'
import type { OhlcvSource } from './ohlcv-base.js'

type OhlcvRow = [number, number, number, number, number, number]

interface ExchangeLike {
  fetchOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
  ): Promise<OhlcvRow[]>
}

export class BinanceSource implements DataSource, OhlcvSource {
  readonly id = 'binance'

  constructor(private readonly exchange: ExchangeLike) {}

  async fetch(): Promise<Signal[]> {
    return []
  }

  async fetchHistorical(_from: Date, _to: Date): Promise<Signal[]> {
    return []
  }

  async fetchOhlcv(
    coins: string[],
    timeframe: string,
    limit: number,
  ): Promise<Record<string, Candle[]>> {
    const results = await Promise.allSettled(
      coins.map(async coin => {
        const rows = await this.exchange.fetchOHLCV(coin, timeframe, undefined, limit)
        const candles: Candle[] = rows.map(r => ({
          timestamp: new Date(r[0]),
          open: r[1],
          high: r[2],
          low: r[3],
          close: r[4],
          volume: r[5],
        }))
        return [coin, candles] as const
      })
    )

    const ohlcv: Record<string, Candle[]> = {}
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [coin, candles] = result.value
        ohlcv[coin] = candles
      }
    }
    return ohlcv
  }
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /path/to/trader/packages/data && pnpm test
```

Expected: all data tests PASS.

- [ ] **Step 5: Update `packages/data/src/index.ts`**

```typescript
export type { DataSource } from './sources/base.js'
export type { OhlcvSource } from './sources/ohlcv-base.js'
export { NullDataSource } from './sources/null.js'
export { FearAndGreedSource } from './sources/fear-and-greed.js'
export { CryptoPanicSource } from './sources/cryptopanic.js'
export { BinanceSource } from './sources/binance.js'
export { Pipeline } from './pipeline.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/sources/binance.ts packages/data/src/index.ts packages/data/tests/sources/binance.test.ts
git commit -m "feat(data): BinanceSource ccxt-backed OhlcvSource"
```

---

### Task 3: ExchangeAdapter interface + CcxtExchangeAdapter

**Files:**
- Create: `packages/core/src/exchange-adapter.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/exchange-adapter.test.ts`

`CcxtExchangeAdapter` uses an injected `CcxtExchangeLike` interface — no ccxt import in this package. The live runner is the only layer that instantiates real ccxt objects.

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/exchange-adapter.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { CcxtExchangeAdapter } from '../src/exchange-adapter.js'

type CcxtOrder = {
  id: string
  average?: number
  price?: number
  amount: number
  datetime?: string
  timestamp?: number
}

function makeMockCcxt(overrides: Partial<{
  buyResult: CcxtOrder
  sellResult: CcxtOrder
}> = {}) {
  const buyResult: CcxtOrder = overrides.buyResult ?? {
    id: 'buy-1',
    average: 50000,
    amount: 0.004,
    datetime: '2024-01-01T00:00:00.000Z',
  }
  const sellResult: CcxtOrder = overrides.sellResult ?? {
    id: 'sell-1',
    average: 51000,
    amount: 0.004,
    datetime: '2024-01-01T01:00:00.000Z',
  }
  return {
    createMarketBuyOrderWithCost: vi.fn(async () => buyResult),
    createMarketSellOrder: vi.fn(async () => sellResult),
  }
}

describe('CcxtExchangeAdapter', () => {
  it('marketBuy calls createMarketBuyOrderWithCost with coin and cost', async () => {
    const ccxt = makeMockCcxt()
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketBuy('BTC/USDT', 200)

    expect(ccxt.createMarketBuyOrderWithCost).toHaveBeenCalledWith('BTC/USDT', 200)
    expect(result.orderId).toBe('buy-1')
    expect(result.fillPrice).toBe(50000)
    expect(result.baseAmount).toBe(0.004)
    expect(result.filledAt).toBeInstanceOf(Date)
  })

  it('marketSell calls createMarketSellOrder with coin and base amount', async () => {
    const ccxt = makeMockCcxt()
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketSell('BTC/USDT', 0.004)

    expect(ccxt.createMarketSellOrder).toHaveBeenCalledWith('BTC/USDT', 0.004)
    expect(result.orderId).toBe('sell-1')
    expect(result.fillPrice).toBe(51000)
  })

  it('uses price field as fallback when average is absent', async () => {
    const ccxt = makeMockCcxt({
      buyResult: { id: 'x', price: 49000, amount: 0.001 },
    })
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketBuy('BTC/USDT', 50)

    expect(result.fillPrice).toBe(49000)
  })

  it('uses timestamp ms as fallback when datetime is absent', async () => {
    const now = Date.now()
    const ccxt = makeMockCcxt({
      buyResult: { id: 'x', average: 50000, amount: 0.001, timestamp: now },
    })
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketBuy('BTC/USDT', 50)

    expect(result.filledAt.getTime()).toBe(now)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/trader/packages/core && pnpm test
```

Expected: FAIL — `CcxtExchangeAdapter` not found.

- [ ] **Step 3: Create `packages/core/src/exchange-adapter.ts`**

```typescript
export interface ExecutedOrder {
  orderId: string
  fillPrice: number
  filledAt: Date
  baseAmount: number
}

export interface ExchangeAdapter {
  marketBuy(coin: string, costInQuote: number): Promise<ExecutedOrder>
  marketSell(coin: string, baseAmount: number): Promise<ExecutedOrder>
}

interface CcxtOrderResult {
  id: string
  average?: number
  price?: number
  amount: number
  datetime?: string
  timestamp?: number
}

interface CcxtExchangeLike {
  createMarketBuyOrderWithCost(symbol: string, cost: number): Promise<CcxtOrderResult>
  createMarketSellOrder(symbol: string, amount: number): Promise<CcxtOrderResult>
}

function toExecutedOrder(order: CcxtOrderResult): ExecutedOrder {
  return {
    orderId: order.id,
    fillPrice: order.average ?? order.price ?? 0,
    filledAt: order.datetime
      ? new Date(order.datetime)
      : new Date(order.timestamp ?? Date.now()),
    baseAmount: order.amount,
  }
}

export class CcxtExchangeAdapter implements ExchangeAdapter {
  constructor(private readonly exchange: CcxtExchangeLike) {}

  async marketBuy(coin: string, costInQuote: number): Promise<ExecutedOrder> {
    const order = await this.exchange.createMarketBuyOrderWithCost(coin, costInQuote)
    return toExecutedOrder(order)
  }

  async marketSell(coin: string, baseAmount: number): Promise<ExecutedOrder> {
    const order = await this.exchange.createMarketSellOrder(coin, baseAmount)
    return toExecutedOrder(order)
  }
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /path/to/trader/packages/core && pnpm test
```

Expected: all core tests PASS (existing + 4 new).

- [ ] **Step 5: Update `packages/core/src/index.ts`**

```typescript
export { CapitalGuard } from './capital-guard.js'
export { PositionTracker } from './position-tracker.js'
export { OrderManager } from './order-manager.js'
export { TradingEngine } from './trading-engine.js'
export type { ExchangeAdapter, ExecutedOrder } from './exchange-adapter.js'
export { CcxtExchangeAdapter } from './exchange-adapter.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/exchange-adapter.ts packages/core/src/index.ts packages/core/tests/exchange-adapter.test.ts
git commit -m "feat(core): ExchangeAdapter interface + CcxtExchangeAdapter"
```

---

### Task 4: OrderManager live mode + TradingEngine sell price passthrough

**Files:**
- Modify: `packages/core/src/order-manager.ts`
- Modify: `packages/core/src/trading-engine.ts`
- Modify: `packages/core/tests/order-manager.test.ts`
- Modify: `packages/core/tests/trading-engine.test.ts`

In live mode, buys call `exchange.marketBuy(coin, size)` and sells call `exchange.marketSell(coin, baseAmount)` where `baseAmount = position.size / position.currentPrice`. The TradingEngine already has `position.currentPrice` via the PositionTracker.

- [ ] **Step 1: Write failing tests for OrderManager live mode**

Add to `packages/core/tests/order-manager.test.ts`:

```typescript
import type { ExchangeAdapter, ExecutedOrder } from '../src/exchange-adapter.js'

function makeMockExchange(overrides: Partial<ExchangeAdapter> = {}): ExchangeAdapter {
  return {
    marketBuy: vi.fn(async (): Promise<ExecutedOrder> => ({
      orderId: 'live-buy-1',
      fillPrice: 50500,
      filledAt: new Date(),
      baseAmount: 0.00396,
    })),
    marketSell: vi.fn(async (): Promise<ExecutedOrder> => ({
      orderId: 'live-sell-1',
      fillPrice: 51000,
      filledAt: new Date(),
      baseAmount: 0.00396,
    })),
    ...overrides,
  }
}

describe('OrderManager live mode', () => {
  it('calls exchange.marketBuy on buy order and fills', async () => {
    const exchange = makeMockExchange()
    const manager = new OrderManager({ paper: false, exchange })

    const order = await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 200 })

    expect(exchange.marketBuy).toHaveBeenCalledWith('BTC/USDT', 200)
    expect(order.status).toBe('filled')
    expect(order.fillPrice).toBe(50500)
  })

  it('calls exchange.marketSell with base amount computed from size/price', async () => {
    const exchange = makeMockExchange()
    const manager = new OrderManager({ paper: false, exchange })

    // Selling $200 worth at current price of $50000 → 0.004 BTC
    await manager.place({ coin: 'BTC/USDT', side: 'sell', size: 200, price: 50000 })

    expect(exchange.marketSell).toHaveBeenCalledWith('BTC/USDT', 0.004)
  })

  it('throws when live sell is attempted without price', async () => {
    const exchange = makeMockExchange()
    const manager = new OrderManager({ paper: false, exchange })

    await expect(
      manager.place({ coin: 'BTC/USDT', side: 'sell', size: 200 })
    ).rejects.toThrow('price')
  })

  it('leaves order open when not paper and no exchange injected', async () => {
    const manager = new OrderManager({ paper: false })

    const order = await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 100 })

    expect(order.status).toBe('open')
  })
})
```

- [ ] **Step 2: Write failing test for TradingEngine sell with exchange**

Add to `packages/core/tests/trading-engine.test.ts`:

```typescript
import type { ExchangeAdapter, ExecutedOrder } from '../src/exchange-adapter.js'

it('passes currentPrice to OrderManager when selling live', async () => {
  const sellSpy = vi.fn(async (): Promise<ExecutedOrder> => ({
    orderId: 'sell-1', fillPrice: 51000, filledAt: new Date(), baseAmount: 0.004,
  }))
  const exchange: ExchangeAdapter = {
    marketBuy: vi.fn(async (): Promise<ExecutedOrder> => ({
      orderId: 'buy-1', fillPrice: 50000, filledAt: new Date(), baseAmount: 0.004,
    })),
    marketSell: sellSpy,
  }
  const engine = new TradingEngine({ totalCapital: 1000, paper: false, exchange })

  // First buy to open a position (paper buy via OrderManager in non-paper mode with exchange
  // means it calls marketBuy — but position.currentPrice defaults to fillPrice)
  await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
  await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'sell' })

  expect(sellSpy).toHaveBeenCalled()
  // marketSell called with base amount = 200 / 50000 = 0.004
  const [coin, baseAmount] = (sellSpy as ReturnType<typeof vi.fn>).mock.calls[0] as [string, number]
  expect(coin).toBe('BTC/USDT')
  expect(baseAmount).toBeCloseTo(0.004, 5)
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/core && pnpm test
```

Expected: FAIL on the 5 new tests.

- [ ] **Step 4: Update `packages/core/src/order-manager.ts`**

Replace the full file:

```typescript
import type { Order, OrderSide } from '@trader/shared'
import type { ExchangeAdapter } from './exchange-adapter.js'
import { randomUUID } from 'crypto'

interface PlaceOrderInput {
  coin: string
  side: OrderSide
  size: number
  price?: number
}

interface OrderManagerConfig {
  paper: boolean
  exchange?: ExchangeAdapter
}

export class OrderManager {
  private readonly paper: boolean
  private readonly exchange?: ExchangeAdapter
  private orders = new Map<string, Order>()

  constructor(config: OrderManagerConfig) {
    this.paper = config.paper
    this.exchange = config.exchange
  }

  async place(input: PlaceOrderInput): Promise<Order> {
    const order: Order = {
      id: randomUUID(),
      coin: input.coin,
      side: input.side,
      size: input.size,
      price: input.price,
      status: 'open',
      createdAt: new Date(),
    }

    if (this.paper) {
      order.status = 'filled'
      order.filledAt = new Date()
      order.fillPrice = input.price
    } else if (this.exchange) {
      if (input.side === 'buy') {
        const result = await this.exchange.marketBuy(input.coin, input.size)
        order.status = 'filled'
        order.filledAt = result.filledAt
        order.fillPrice = result.fillPrice
      } else {
        if (input.price === undefined) {
          throw new Error(`price is required for live sell orders on ${input.coin}`)
        }
        const baseAmount = input.size / input.price
        const result = await this.exchange.marketSell(input.coin, baseAmount)
        order.status = 'filled'
        order.filledAt = result.filledAt
        order.fillPrice = result.fillPrice
      }
    }

    this.orders.set(order.id, order)
    return order
  }

  async cancel(orderId: string): Promise<void> {
    const order = this.orders.get(orderId)
    if (order && order.status !== 'cancelled') {
      this.orders.set(orderId, { ...order, status: 'cancelled' })
    }
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId)
  }

  getOpenOrders(): Order[] {
    return Array.from(this.orders.values()).filter(o => o.status === 'open')
  }

  getAllOrders(): Order[] {
    return Array.from(this.orders.values())
  }
}
```

- [ ] **Step 5: Update `packages/core/src/trading-engine.ts` — accept exchange, pass currentPrice on sell**

Replace the full file:

```typescript
import type { LLMDecision, Position, Order } from '@trader/shared'
import type { ExchangeAdapter } from './exchange-adapter.js'
import { CapitalGuard } from './capital-guard.js'
import { PositionTracker } from './position-tracker.js'
import { OrderManager } from './order-manager.js'

interface TradingEngineConfig {
  totalCapital: number
  paper: boolean
  exchange?: ExchangeAdapter
}

interface ExecuteResult {
  executed: boolean
  reason?: string
  order?: Order
}

export class TradingEngine {
  private readonly guard: CapitalGuard
  private readonly positions: PositionTracker
  private readonly orders: OrderManager

  constructor(config: TradingEngineConfig) {
    this.guard = new CapitalGuard({ totalCapital: config.totalCapital })
    this.positions = new PositionTracker()
    this.orders = new OrderManager({ paper: config.paper, exchange: config.exchange })
  }

  async execute(decision: LLMDecision): Promise<ExecuteResult> {
    if (decision.action === 'hold') {
      return { executed: false, reason: 'hold' }
    }

    if (decision.action === 'buy') {
      if (!this.guard.canTrade(decision.size)) {
        return {
          executed: false,
          reason: `Insufficient capital: need ${decision.size}, have ${this.guard.availableCapital()}`,
        }
      }

      const order = await this.orders.place({
        coin: decision.coin,
        side: 'buy',
        size: decision.size,
        price: undefined,
      })

      if (order.status === 'filled') {
        this.guard.reserve(decision.size)
        this.positions.open({
          coin: decision.coin,
          size: decision.size,
          entryPrice: order.fillPrice ?? 0,
          currentPrice: order.fillPrice ?? 0,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
        })
      }

      return { executed: true, order }
    }

    if (decision.action === 'sell') {
      const position = this.positions.get(decision.coin)
      if (!position) {
        return { executed: false, reason: `No open position for ${decision.coin}` }
      }

      const order = await this.orders.place({
        coin: decision.coin,
        side: 'sell',
        size: decision.size,
        price: position.currentPrice,
      })

      if (order.status === 'filled') {
        this.positions.close(decision.coin)
        this.guard.release(decision.size)
      }

      return { executed: true, order }
    }

    return { executed: false, reason: 'unknown action' }
  }

  getPositions(): Position[] {
    return this.positions.getAll()
  }

  getOpenOrders(): Order[] {
    return this.orders.getOpenOrders()
  }

  availableCapital(): number {
    return this.guard.availableCapital()
  }
}
```

- [ ] **Step 6: Run all core tests**

```bash
cd /path/to/trader/packages/core && pnpm test
```

Expected: all tests PASS (existing + 5 new).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/order-manager.ts packages/core/src/trading-engine.ts packages/core/tests/order-manager.test.ts packages/core/tests/trading-engine.test.ts
git commit -m "feat(core): OrderManager live mode via ExchangeAdapter; TradingEngine passes currentPrice on sell"
```

---

### Task 5: Runner package — config, scheduler, live entry point

**Files:**
- Create: `packages/runner/package.json`
- Create: `packages/runner/tsconfig.json`
- Create: `packages/runner/src/config.ts`
- Create: `packages/runner/src/scheduler.ts`
- Create: `packages/runner/src/live-runner.ts`
- Create: `packages/runner/src/index.ts`
- Create: `packages/runner/tests/config.test.ts`
- Create: `packages/runner/tests/scheduler.test.ts`

The runner is the only package that imports ccxt and node-cron. It wires the full live trading system from environment variables. `live-runner.ts` is not tested (it instantiates real external dependencies); only `config.ts` and `scheduler.ts` are tested.

- [ ] **Step 1: Create `packages/runner/package.json`**

```json
{
  "name": "@trader/runner",
  "version": "0.0.1",
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
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@trader/shared": "workspace:*",
    "@trader/core": "workspace:*",
    "@trader/data": "workspace:*",
    "@trader/llm": "workspace:*",
    "ccxt": "^4.0.0",
    "node-cron": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/runner/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write failing config tests**

Create `packages/runner/tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from '../src/config.js'

function withEnv(vars: Record<string, string>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

const requiredEnv = {
  BINANCE_API_KEY: 'test-key',
  BINANCE_SECRET: 'test-secret',
  ANTHROPIC_API_KEY: 'test-anthropic',
}

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env['BINANCE_API_KEY']
    delete process.env['BINANCE_SECRET']
    delete process.env['ANTHROPIC_API_KEY']
    delete process.env['TOTAL_CAPITAL']
    delete process.env['AUTO_TRADE_LIMIT']
    delete process.env['COINS']
    delete process.env['TIMEFRAME']
    delete process.env['PAPER']
  })

  it('throws when BINANCE_API_KEY is missing', () => {
    expect(() => loadConfig()).toThrow('BINANCE_API_KEY')
  })

  it('throws when BINANCE_SECRET is missing', () => {
    process.env['BINANCE_API_KEY'] = 'key'
    expect(() => loadConfig()).toThrow('BINANCE_SECRET')
  })

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    process.env['BINANCE_API_KEY'] = 'key'
    process.env['BINANCE_SECRET'] = 'secret'
    expect(() => loadConfig()).toThrow('ANTHROPIC_API_KEY')
  })

  it('returns config with required values when all env vars set', () => {
    withEnv(requiredEnv, () => {
      const config = loadConfig()
      expect(config.binanceApiKey).toBe('test-key')
      expect(config.binanceSecret).toBe('test-secret')
      expect(config.anthropicApiKey).toBe('test-anthropic')
    })
  })

  it('uses defaults for optional env vars', () => {
    withEnv(requiredEnv, () => {
      const config = loadConfig()
      expect(config.totalCapital).toBe(1000)
      expect(config.autoTradeLimit).toBe(50)
      expect(config.coins).toEqual(['BTC/USDT', 'ETH/USDT'])
      expect(config.timeframe).toBe('15m')
      expect(config.paper).toBe(true)
      expect(config.cronExpression).toBe('*/15 * * * *')
    })
  })

  it('parses COINS as comma-separated list', () => {
    withEnv({ ...requiredEnv, COINS: 'BTC/USDT,ETH/USDT,SOL/USDT' }, () => {
      const config = loadConfig()
      expect(config.coins).toEqual(['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])
    })
  })

  it('sets paper=false when PAPER=false', () => {
    withEnv({ ...requiredEnv, PAPER: 'false' }, () => {
      const config = loadConfig()
      expect(config.paper).toBe(false)
    })
  })
})
```

- [ ] **Step 4: Write failing scheduler tests**

Create `packages/runner/tests/scheduler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Scheduler } from '../src/scheduler.js'

describe('Scheduler', () => {
  it('calls cycle.run() when the cron job fires', async () => {
    const run = vi.fn(async () => {})
    const scheduler = new Scheduler({ run }, '* * * * *')

    // Manually trigger the callback to simulate a cron tick
    await scheduler['tick']()

    expect(run).toHaveBeenCalledOnce()
  })

  it('does not throw when cycle.run() rejects — logs error instead', async () => {
    const run = vi.fn(async () => { throw new Error('cycle failed') })
    const scheduler = new Scheduler({ run }, '* * * * *')

    // Should not throw
    await expect(scheduler['tick']()).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledOnce()
  })

  it('stop() cancels the scheduled job', () => {
    const scheduler = new Scheduler({ run: vi.fn() }, '*/15 * * * *')
    scheduler.start()
    scheduler.stop()
    // After stop, task should be null
    expect(scheduler['task']).toBeNull()
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd /path/to/trader && pnpm install && cd packages/runner && pnpm test
```

Expected: FAIL — `loadConfig` and `Scheduler` not found.

- [ ] **Step 6: Create `packages/runner/src/config.ts`**

```typescript
export interface LiveConfig {
  binanceApiKey: string
  binanceSecret: string
  anthropicApiKey: string
  totalCapital: number
  autoTradeLimit: number
  coins: string[]
  timeframe: string
  ohlcvLimit: number
  cronExpression: string
  paper: boolean
}

export function loadConfig(): LiveConfig {
  function required(key: string): string {
    const val = process.env[key]
    if (!val) throw new Error(`Missing required env var: ${key}`)
    return val
  }

  return {
    binanceApiKey: required('BINANCE_API_KEY'),
    binanceSecret: required('BINANCE_SECRET'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    totalCapital: Number(process.env['TOTAL_CAPITAL'] ?? '1000'),
    autoTradeLimit: Number(process.env['AUTO_TRADE_LIMIT'] ?? '50'),
    coins: (process.env['COINS'] ?? 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env['TIMEFRAME'] ?? '15m',
    ohlcvLimit: Number(process.env['OHLCV_LIMIT'] ?? '100'),
    cronExpression: process.env['CRON_EXPRESSION'] ?? '*/15 * * * *',
    paper: process.env['PAPER'] !== 'false',
  }
}
```

- [ ] **Step 7: Create `packages/runner/src/scheduler.ts`**

```typescript
import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'

interface CycleLike {
  run(): Promise<unknown>
}

export class Scheduler {
  private task: ScheduledTask | null = null

  constructor(
    private readonly cycle: CycleLike,
    private readonly cronExpression: string,
  ) {}

  start(): void {
    this.task = cron.schedule(this.cronExpression, () => {
      void this.tick()
    })
  }

  stop(): void {
    this.task?.stop()
    this.task = null
  }

  private async tick(): Promise<void> {
    try {
      await this.cycle.run()
    } catch (err) {
      console.error('[Scheduler] Cycle error:', err)
    }
  }
}
```

- [ ] **Step 8: Run tests to verify config and scheduler tests pass**

```bash
cd /path/to/trader/packages/runner && pnpm test
```

Expected: all runner tests PASS.

- [ ] **Step 9: Create `packages/runner/src/live-runner.ts`**

```typescript
import ccxt from 'ccxt'
import { ClaudeAdapter } from '@trader/llm'
import { EvaluationCycle } from '@trader/llm'
import { TradingEngine, CcxtExchangeAdapter } from '@trader/core'
import { Pipeline, BinanceSource } from '@trader/data'
import { Scheduler } from './scheduler.js'
import type { LiveConfig } from './config.js'

export interface LiveTraderHandle {
  stop(): void
}

export function startLiveTrader(config: LiveConfig): LiveTraderHandle {
  const binanceExchange = new ccxt.binance({
    apiKey: config.binanceApiKey,
    secret: config.binanceSecret,
  })

  const binanceSource = new BinanceSource(binanceExchange)

  const pipeline = new Pipeline({
    sources: [],
    ohlcvSource: binanceSource,
    coins: config.coins,
    timeframe: config.timeframe,
    ohlcvLimit: config.ohlcvLimit,
  })

  const exchangeAdapter = config.paper ? undefined : new CcxtExchangeAdapter(binanceExchange)

  const engine = new TradingEngine({
    totalCapital: config.totalCapital,
    paper: config.paper,
    exchange: exchangeAdapter,
  })

  const llmAdapter = new ClaudeAdapter({ apiKey: config.anthropicApiKey })

  const cycle = new EvaluationCycle({
    pipeline,
    adapter: llmAdapter,
    engine,
    autoTradeLimit: config.autoTradeLimit,
  })

  const scheduler = new Scheduler(cycle, config.cronExpression)
  scheduler.start()

  console.log(
    `[LiveTrader] Started. paper=${config.paper}, coins=${config.coins.join(',')}, cron="${config.cronExpression}"`,
  )

  return { stop: () => scheduler.stop() }
}
```

- [ ] **Step 10: Create `packages/runner/src/index.ts`**

```typescript
export type { LiveConfig } from './config.js'
export { loadConfig } from './config.js'
export { Scheduler } from './scheduler.js'
export { startLiveTrader } from './live-runner.js'
export type { LiveTraderHandle } from './live-runner.js'
```

- [ ] **Step 11: Add `@trader/runner` alias to root `vitest.config.ts`**

Read `/path/to/trader/vitest.config.ts` and add:
```typescript
'@trader/runner': resolve(__dirname, './packages/runner/dist'),
```

alongside the existing aliases.

- [ ] **Step 12: Build all packages and run full workspace tests**

Build in dependency order:

```bash
cd /path/to/trader
pnpm --filter '@trader/shared' build
pnpm --filter '@trader/core' build
pnpm --filter '@trader/data' build
pnpm --filter '@trader/llm' build
pnpm --filter '@trader/backtest' build
pnpm --filter '@trader/runner' build
```

Run all tests:
```bash
pnpm --filter './packages/**' test
```

Expected: all packages pass. Note that runner build requires ccxt and node-cron — `pnpm install` at the root must run before building.

- [ ] **Step 13: Commit**

```bash
git add packages/runner/ vitest.config.ts
git commit -m "feat(runner): config, scheduler, live-runner entry point"
```
