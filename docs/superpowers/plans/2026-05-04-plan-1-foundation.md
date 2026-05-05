# Crypto Trader — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the pnpm monorepo, shared TypeScript types, core trading engine (paper mode), and the data ingestion pipeline with two real sources.

**Architecture:** pnpm workspaces monorepo with `shared`, `core`, and `data` packages. Core enforces capital safety in-process. Data sources implement a common interface and run in parallel per evaluation cycle.

**Tech Stack:** TypeScript 5, pnpm workspaces, vitest, ccxt, node-fetch

---

## File Map

```
trader/
  package.json                          # workspace root, scripts, shared devDeps
  pnpm-workspace.yaml                   # declares packages/*
  tsconfig.base.json                    # shared TS compiler options
  vitest.config.ts                      # root vitest config
  packages/
    shared/
      package.json
      tsconfig.json
      src/
        types/
          signal.ts                     # Signal, Candle, WorldSnapshot
          trade.ts                      # Order, Position, Trade
          decision.ts                   # LLMDecision, TradingContext
        index.ts                        # re-exports all types
    core/
      package.json
      tsconfig.json
      src/
        capital-guard.ts                # enforces hard capital cap
        position-tracker.ts             # tracks open positions
        order-manager.ts                # paper-mode order execution
        trading-engine.ts               # orchestrates the above
        index.ts
      tests/
        capital-guard.test.ts
        position-tracker.test.ts
        order-manager.test.ts
        trading-engine.test.ts
    data/
      package.json
      tsconfig.json
      src/
        sources/
          base.ts                       # DataSource interface
          null.ts                       # NullDataSource (always returns [])
          fear-and-greed.ts             # Alternative.me Fear & Greed index
          cryptopanic.ts                # CryptoPanic news aggregator
        pipeline.ts                     # runs sources in parallel → WorldSnapshot
        index.ts
      tests/
        pipeline.test.ts
        sources/
          null.test.ts
          fear-and-greed.test.ts
          cryptopanic.test.ts
```

---

## Task 1: Monorepo root scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "trader",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

- [ ] **Step 5: Install root dependencies**

```bash
pnpm install
```

Expected: `node_modules/` created at root, no errors.

- [ ] **Step 6: Commit**

```bash
git init
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts
git commit -m "chore: init monorepo with pnpm workspaces and vitest"
```

---

## Task 2: Shared types package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types/signal.ts`
- Create: `packages/shared/src/types/trade.ts`
- Create: `packages/shared/src/types/decision.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@trader/shared",
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
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/shared/src/types/signal.ts`**

```typescript
export type SignalType = 'news' | 'sentiment' | 'onchain' | 'macro' | 'price'

export interface Signal {
  source: string
  type: SignalType
  content: string
  timestamp: Date
  coins?: string[]
  raw?: unknown
}

export interface Candle {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface WorldSnapshot {
  timestamp: Date
  signals: Signal[]
  ohlcv: Record<string, Candle[]>
}
```

- [ ] **Step 4: Create `packages/shared/src/types/trade.ts`**

```typescript
export type OrderSide = 'buy' | 'sell'
export type OrderStatus = 'open' | 'filled' | 'cancelled'

export interface Order {
  id: string
  coin: string
  side: OrderSide
  size: number
  price?: number
  status: OrderStatus
  createdAt: Date
  filledAt?: Date
  fillPrice?: number
}

export interface Position {
  coin: string
  size: number
  entryPrice: number
  currentPrice: number
  openedAt: Date
  stopLoss?: number
  takeProfit?: number
}

export interface Trade {
  id: string
  coin: string
  side: OrderSide
  size: number
  entryPrice: number
  exitPrice?: number
  openedAt: Date
  closedAt?: Date
  pnl?: number
  reasoning?: string
}
```

- [ ] **Step 5: Create `packages/shared/src/types/decision.ts`**

```typescript
import type { WorldSnapshot } from './signal.js'
import type { Position, Trade, Order } from './trade.js'

export interface LLMDecision {
  action: 'buy' | 'sell' | 'hold'
  coin: string
  size: number
  confidence: number
  reasoning: string
  stopLoss?: number
  takeProfit?: number
}

export interface TradingContext {
  snapshot: WorldSnapshot
  positions: Position[]
  availableCapital: number
  recentTrades: Trade[]
  openOrders: Order[]
}
```

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```typescript
export * from './types/signal.js'
export * from './types/trade.js'
export * from './types/decision.js'
```

- [ ] **Step 7: Build and typecheck**

```bash
cd packages/shared && pnpm build
```

Expected: `packages/shared/dist/` created, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add core TypeScript types for signals, trades, and LLM decisions"
```

---

## Task 3: Core — CapitalGuard

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/capital-guard.ts`
- Create: `packages/core/tests/capital-guard.test.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@trader/core",
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
    "test": "vitest run"
  },
  "dependencies": {
    "@trader/shared": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

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

- [ ] **Step 3: Write the failing test**

Create `packages/core/tests/capital-guard.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { CapitalGuard } from '../src/capital-guard.js'

describe('CapitalGuard', () => {
  let guard: CapitalGuard

  beforeEach(() => {
    guard = new CapitalGuard({ totalCapital: 1000 })
  })

  it('allows a trade that fits within available capital', () => {
    expect(guard.canTrade(200)).toBe(true)
  })

  it('rejects a trade that exceeds available capital', () => {
    expect(guard.canTrade(1100)).toBe(false)
  })

  it('tracks deployed capital after reserving', () => {
    guard.reserve(300)
    expect(guard.availableCapital()).toBe(700)
  })

  it('rejects if trade would exceed remaining capital', () => {
    guard.reserve(800)
    expect(guard.canTrade(300)).toBe(false)
  })

  it('releases capital on release()', () => {
    guard.reserve(500)
    guard.release(500)
    expect(guard.availableCapital()).toBe(1000)
  })

  it('does not release more than deployed', () => {
    guard.reserve(200)
    guard.release(500)
    expect(guard.availableCapital()).toBe(1000)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd packages/core && pnpm test
```

Expected: FAIL — `Cannot find module '../src/capital-guard.js'`

- [ ] **Step 5: Implement `packages/core/src/capital-guard.ts`**

```typescript
interface CapitalGuardConfig {
  totalCapital: number
}

export class CapitalGuard {
  private readonly total: number
  private deployed = 0

  constructor(config: CapitalGuardConfig) {
    this.total = config.totalCapital
  }

  canTrade(size: number): boolean {
    return size <= this.total - this.deployed
  }

  reserve(size: number): void {
    this.deployed = Math.min(this.deployed + size, this.total)
  }

  release(size: number): void {
    this.deployed = Math.max(0, this.deployed - size)
  }

  availableCapital(): number {
    return this.total - this.deployed
  }

  deployedCapital(): number {
    return this.deployed
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd packages/core && pnpm test
```

Expected: 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add CapitalGuard with hard capital cap enforcement"
```

---

## Task 4: Core — PositionTracker

**Files:**
- Create: `packages/core/src/position-tracker.ts`
- Create: `packages/core/tests/position-tracker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/position-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { PositionTracker } from '../src/position-tracker.js'

describe('PositionTracker', () => {
  let tracker: PositionTracker

  beforeEach(() => {
    tracker = new PositionTracker()
  })

  it('starts with no positions', () => {
    expect(tracker.getAll()).toHaveLength(0)
  })

  it('opens a position', () => {
    tracker.open({ coin: 'BTC/USDT', size: 100, entryPrice: 50000, currentPrice: 50000 })
    expect(tracker.getAll()).toHaveLength(1)
    expect(tracker.get('BTC/USDT')).toBeDefined()
  })

  it('updates current price', () => {
    tracker.open({ coin: 'BTC/USDT', size: 100, entryPrice: 50000, currentPrice: 50000 })
    tracker.updatePrice('BTC/USDT', 55000)
    expect(tracker.get('BTC/USDT')?.currentPrice).toBe(55000)
  })

  it('closes a position and returns it', () => {
    tracker.open({ coin: 'ETH/USDT', size: 200, entryPrice: 3000, currentPrice: 3000 })
    const closed = tracker.close('ETH/USDT')
    expect(closed?.coin).toBe('ETH/USDT')
    expect(tracker.get('ETH/USDT')).toBeUndefined()
  })

  it('returns undefined when closing non-existent position', () => {
    expect(tracker.close('SOL/USDT')).toBeUndefined()
  })

  it('calculates unrealized PnL', () => {
    tracker.open({ coin: 'BTC/USDT', size: 100, entryPrice: 50000, currentPrice: 55000 })
    expect(tracker.unrealizedPnl('BTC/USDT')).toBeCloseTo(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/position-tracker.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/position-tracker.ts`**

```typescript
import type { Position } from '@trader/shared'

type OpenPositionInput = Pick<Position, 'coin' | 'size' | 'entryPrice' | 'currentPrice'> & {
  stopLoss?: number
  takeProfit?: number
}

export class PositionTracker {
  private positions = new Map<string, Position>()

  open(input: OpenPositionInput): Position {
    const position: Position = {
      ...input,
      openedAt: new Date(),
    }
    this.positions.set(input.coin, position)
    return position
  }

  close(coin: string): Position | undefined {
    const position = this.positions.get(coin)
    this.positions.delete(coin)
    return position
  }

  get(coin: string): Position | undefined {
    return this.positions.get(coin)
  }

  getAll(): Position[] {
    return Array.from(this.positions.values())
  }

  updatePrice(coin: string, currentPrice: number): void {
    const position = this.positions.get(coin)
    if (position) {
      this.positions.set(coin, { ...position, currentPrice })
    }
  }

  unrealizedPnl(coin: string): number {
    const position = this.positions.get(coin)
    if (!position) return 0
    return ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm test tests/position-tracker.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/position-tracker.ts packages/core/tests/position-tracker.test.ts
git commit -m "feat(core): add PositionTracker for open position management"
```

---

## Task 5: Core — OrderManager (paper mode)

**Files:**
- Create: `packages/core/src/order-manager.ts`
- Create: `packages/core/tests/order-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/order-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { OrderManager } from '../src/order-manager.js'

describe('OrderManager (paper mode)', () => {
  let manager: OrderManager

  beforeEach(() => {
    manager = new OrderManager({ paper: true })
  })

  it('places a buy order and returns it as filled immediately in paper mode', async () => {
    const order = await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 100, price: 50000 })
    expect(order.status).toBe('filled')
    expect(order.fillPrice).toBe(50000)
  })

  it('places a sell order and returns it as filled in paper mode', async () => {
    const order = await manager.place({ coin: 'BTC/USDT', side: 'sell', size: 100, price: 51000 })
    expect(order.status).toBe('filled')
    expect(order.fillPrice).toBe(51000)
  })

  it('tracks open orders before fill in paper mode sync test', async () => {
    const order = await manager.place({ coin: 'ETH/USDT', side: 'buy', size: 50, price: 3000 })
    expect(manager.getOrder(order.id)).toBeDefined()
  })

  it('cancels an order', async () => {
    const order = await manager.place({ coin: 'ETH/USDT', side: 'buy', size: 50, price: 3000 })
    await manager.cancel(order.id)
    expect(manager.getOrder(order.id)?.status).toBe('cancelled')
  })

  it('lists all open (filled in paper mode) orders', async () => {
    await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 100, price: 50000 })
    await manager.place({ coin: 'ETH/USDT', side: 'buy', size: 50, price: 3000 })
    expect(manager.getOpenOrders()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/order-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/order-manager.ts`**

```typescript
import type { Order, OrderSide } from '@trader/shared'
import { randomUUID } from 'crypto'

interface PlaceOrderInput {
  coin: string
  side: OrderSide
  size: number
  price?: number
}

interface OrderManagerConfig {
  paper: boolean
}

export class OrderManager {
  private readonly paper: boolean
  private orders = new Map<string, Order>()

  constructor(config: OrderManagerConfig) {
    this.paper = config.paper
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
    }

    this.orders.set(order.id, order)
    return order
  }

  async cancel(orderId: string): Promise<void> {
    const order = this.orders.get(orderId)
    if (order && order.status === 'open') {
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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm test tests/order-manager.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/order-manager.ts packages/core/tests/order-manager.test.ts
git commit -m "feat(core): add OrderManager with paper trading mode"
```

---

## Task 6: Core — TradingEngine + index

**Files:**
- Create: `packages/core/src/trading-engine.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/tests/trading-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/trading-engine.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { TradingEngine } from '../src/trading-engine.js'
import type { LLMDecision } from '@trader/shared'

describe('TradingEngine', () => {
  let engine: TradingEngine

  beforeEach(() => {
    engine = new TradingEngine({ totalCapital: 1000, paper: true })
  })

  it('executes a buy decision and opens a position', async () => {
    const decision: LLMDecision = {
      action: 'buy',
      coin: 'BTC/USDT',
      size: 200,
      confidence: 0.9,
      reasoning: 'strong signal',
      stopLoss: 48000,
      takeProfit: 55000,
    }

    const result = await engine.execute(decision)
    expect(result.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(1)
    expect(engine.availableCapital()).toBe(800)
  })

  it('rejects a trade that exceeds capital', async () => {
    const decision: LLMDecision = {
      action: 'buy',
      coin: 'ETH/USDT',
      size: 1500,
      confidence: 0.8,
      reasoning: 'too big',
    }

    const result = await engine.execute(decision)
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/capital/i)
  })

  it('ignores hold decisions', async () => {
    const decision: LLMDecision = {
      action: 'hold',
      coin: 'BTC/USDT',
      size: 0,
      confidence: 0.5,
      reasoning: 'waiting',
    }

    const result = await engine.execute(decision)
    expect(result.executed).toBe(false)
    expect(result.reason).toBe('hold')
  })

  it('executes a sell and closes position', async () => {
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })

    const sell: LLMDecision = { action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' }
    const result = await engine.execute(sell)

    expect(result.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(0)
    expect(engine.availableCapital()).toBe(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/trading-engine.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/trading-engine.ts`**

```typescript
import type { LLMDecision, Position, Order } from '@trader/shared'
import { CapitalGuard } from './capital-guard.js'
import { PositionTracker } from './position-tracker.js'
import { OrderManager } from './order-manager.js'

interface TradingEngineConfig {
  totalCapital: number
  paper: boolean
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
    this.orders = new OrderManager({ paper: config.paper })
  }

  async execute(decision: LLMDecision): Promise<ExecuteResult> {
    if (decision.action === 'hold') {
      return { executed: false, reason: 'hold' }
    }

    if (decision.action === 'buy') {
      if (!this.guard.canTrade(decision.size)) {
        return { executed: false, reason: `Insufficient capital: need ${decision.size}, have ${this.guard.availableCapital()}` }
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
        price: undefined,
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

- [ ] **Step 4: Create `packages/core/src/index.ts`**

```typescript
export { CapitalGuard } from './capital-guard.js'
export { PositionTracker } from './position-tracker.js'
export { OrderManager } from './order-manager.js'
export { TradingEngine } from './trading-engine.js'
```

- [ ] **Step 5: Run all core tests**

```bash
cd packages/core && pnpm test
```

Expected: all tests PASS (capital-guard, position-tracker, order-manager, trading-engine).

- [ ] **Step 6: Build core**

```bash
cd packages/core && pnpm build
```

Expected: `packages/core/dist/` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/trading-engine.ts packages/core/src/index.ts packages/core/tests/trading-engine.test.ts
git commit -m "feat(core): add TradingEngine orchestrating capital guard, positions, and orders"
```

---

## Task 7: Data — DataSource interface, NullDataSource, Pipeline

**Files:**
- Create: `packages/data/package.json`
- Create: `packages/data/tsconfig.json`
- Create: `packages/data/src/sources/base.ts`
- Create: `packages/data/src/sources/null.ts`
- Create: `packages/data/src/pipeline.ts`
- Create: `packages/data/src/index.ts`
- Create: `packages/data/tests/pipeline.test.ts`
- Create: `packages/data/tests/sources/null.test.ts`

- [ ] **Step 1: Create `packages/data/package.json`**

```json
{
  "name": "@trader/data",
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
    "test": "vitest run"
  },
  "dependencies": {
    "@trader/shared": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/data/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/data/src/sources/base.ts`**

```typescript
import type { Signal } from '@trader/shared'

export interface DataSource {
  readonly id: string
  fetch(): Promise<Signal[]>
  fetchHistorical(from: Date, to: Date): Promise<Signal[]>
}
```

- [ ] **Step 4: Create `packages/data/src/sources/null.ts`**

```typescript
import type { Signal } from '@trader/shared'
import type { DataSource } from './base.js'

export class NullDataSource implements DataSource {
  readonly id = 'null'

  async fetch(): Promise<Signal[]> {
    return []
  }

  async fetchHistorical(_from: Date, _to: Date): Promise<Signal[]> {
    return []
  }
}
```

- [ ] **Step 5: Write the failing pipeline test**

Create `packages/data/tests/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { Pipeline } from '../src/pipeline.js'
import { NullDataSource } from '../src/sources/null.js'
import type { DataSource } from '../src/sources/base.js'
import type { Signal } from '@trader/shared'

const makeSource = (id: string, signals: Signal[]): DataSource => ({
  id,
  fetch: async () => signals,
  fetchHistorical: async () => signals,
})

describe('Pipeline', () => {
  it('builds a WorldSnapshot with merged signals from all sources', async () => {
    const s1 = makeSource('source-a', [
      { source: 'source-a', type: 'sentiment', content: 'Fear index: 30', timestamp: new Date() },
    ])
    const s2 = makeSource('source-b', [
      { source: 'source-b', type: 'news', content: 'Bitcoin ETF approved', timestamp: new Date() },
    ])

    const pipeline = new Pipeline({ sources: [s1, s2] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals).toHaveLength(2)
    expect(snapshot.signals.map(s => s.source)).toContain('source-a')
    expect(snapshot.signals.map(s => s.source)).toContain('source-b')
  })

  it('returns empty signals when all sources return nothing', async () => {
    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const snapshot = await pipeline.fetch()
    expect(snapshot.signals).toHaveLength(0)
  })

  it('continues if one source throws, others succeed', async () => {
    const failing: DataSource = {
      id: 'failing',
      fetch: async () => { throw new Error('network error') },
      fetchHistorical: async () => [],
    }
    const working = makeSource('working', [
      { source: 'working', type: 'macro', content: 'CPI data released', timestamp: new Date() },
    ])

    const pipeline = new Pipeline({ sources: [failing, working] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals).toHaveLength(1)
    expect(snapshot.signals[0].source).toBe('working')
  })

  it('sorts signals by timestamp descending', async () => {
    const old = new Date('2024-01-01')
    const recent = new Date('2024-01-02')
    const source = makeSource('s', [
      { source: 's', type: 'news', content: 'old', timestamp: old },
      { source: 's', type: 'news', content: 'recent', timestamp: recent },
    ])

    const pipeline = new Pipeline({ sources: [source] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals[0].timestamp).toEqual(recent)
    expect(snapshot.signals[1].timestamp).toEqual(old)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd packages/data && pnpm install && pnpm test tests/pipeline.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement `packages/data/src/pipeline.ts`**

```typescript
import type { WorldSnapshot, Signal } from '@trader/shared'
import type { DataSource } from './sources/base.js'

interface PipelineConfig {
  sources: DataSource[]
}

export class Pipeline {
  private readonly sources: DataSource[]

  constructor(config: PipelineConfig) {
    this.sources = config.sources
  }

  async fetch(): Promise<WorldSnapshot> {
    const results = await Promise.allSettled(
      this.sources.map(source => source.fetch())
    )

    const signals: Signal[] = results
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return {
      timestamp: new Date(),
      signals,
      ohlcv: {},
    }
  }

  async fetchHistorical(from: Date, to: Date): Promise<WorldSnapshot> {
    const results = await Promise.allSettled(
      this.sources.map(source => source.fetchHistorical(from, to))
    )

    const signals: Signal[] = results
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return {
      timestamp: to,
      signals,
      ohlcv: {},
    }
  }
}
```

- [ ] **Step 8: Create `packages/data/src/index.ts`**

```typescript
export type { DataSource } from './sources/base.js'
export { NullDataSource } from './sources/null.js'
export { Pipeline } from './pipeline.js'
```

- [ ] **Step 9: Run all data tests**

```bash
cd packages/data && pnpm test
```

Expected: all 4 pipeline tests PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/data
git commit -m "feat(data): add DataSource interface, NullDataSource, and Pipeline with fault-tolerant parallel fetch"
```

---

## Task 8: Data — Fear & Greed source

**Files:**
- Create: `packages/data/src/sources/fear-and-greed.ts`
- Create: `packages/data/tests/sources/fear-and-greed.test.ts`

The Alternative.me API endpoint is `https://api.alternative.me/fng/` for current and `https://api.alternative.me/fng/?limit=N` for history. It returns JSON with no authentication required.

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/sources/fear-and-greed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FearAndGreedSource } from '../../src/sources/fear-and-greed.js'

describe('FearAndGreedSource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a sentiment signal for current data', async () => {
    const mockResponse = {
      data: [{ value: '35', value_classification: 'Fear', timestamp: '1704067200' }],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const source = new FearAndGreedSource()
    const signals = await source.fetch()

    expect(signals).toHaveLength(1)
    expect(signals[0].type).toBe('sentiment')
    expect(signals[0].source).toBe('fear-and-greed')
    expect(signals[0].content).toContain('35')
    expect(signals[0].content).toContain('Fear')
  })

  it('returns empty array on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    const source = new FearAndGreedSource()
    const signals = await source.fetch()

    expect(signals).toHaveLength(0)
  })

  it('returns historical signals for a date range', async () => {
    const mockResponse = {
      data: [
        { value: '25', value_classification: 'Extreme Fear', timestamp: '1704067200' },
        { value: '40', value_classification: 'Fear', timestamp: '1703980800' },
      ],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const source = new FearAndGreedSource()
    const from = new Date('2024-01-01')
    const to = new Date('2024-01-02')
    const signals = await source.fetchHistorical(from, to)

    expect(signals).toHaveLength(2)
    expect(signals[0].type).toBe('sentiment')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/data && pnpm test tests/sources/fear-and-greed.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/data/src/sources/fear-and-greed.ts`**

```typescript
import type { Signal } from '@trader/shared'
import type { DataSource } from './base.js'

interface FngDataPoint {
  value: string
  value_classification: string
  timestamp: string
}

interface FngResponse {
  data: FngDataPoint[]
}

export class FearAndGreedSource implements DataSource {
  readonly id = 'fear-and-greed'
  private readonly baseUrl = 'https://api.alternative.me/fng/'

  async fetch(): Promise<Signal[]> {
    try {
      const res = await fetch(`${this.baseUrl}?limit=1`)
      if (!res.ok) return []
      const body = (await res.json()) as FngResponse
      return body.data.map(d => this.toSignal(d))
    } catch {
      return []
    }
  }

  async fetchHistorical(from: Date, to: Date): Promise<Signal[]> {
    const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1
    try {
      const res = await fetch(`${this.baseUrl}?limit=${days}`)
      if (!res.ok) return []
      const body = (await res.json()) as FngResponse
      return body.data
        .map(d => this.toSignal(d))
        .filter(s => s.timestamp >= from && s.timestamp <= to)
    } catch {
      return []
    }
  }

  private toSignal(d: FngDataPoint): Signal {
    return {
      source: this.id,
      type: 'sentiment',
      content: `Crypto Fear & Greed Index: ${d.value} (${d.value_classification})`,
      timestamp: new Date(Number(d.timestamp) * 1000),
      raw: d,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/data && pnpm test tests/sources/fear-and-greed.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Export from index**

Add to `packages/data/src/index.ts`:

```typescript
export { FearAndGreedSource } from './sources/fear-and-greed.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/sources/fear-and-greed.ts packages/data/tests/sources/fear-and-greed.test.ts packages/data/src/index.ts
git commit -m "feat(data): add FearAndGreedSource using Alternative.me API"
```

---

## Task 9: Data — CryptoPanic news source

**Files:**
- Create: `packages/data/src/sources/cryptopanic.ts`
- Create: `packages/data/tests/sources/cryptopanic.test.ts`

CryptoPanic API: `https://cryptopanic.com/api/v1/posts/?auth_token=TOKEN&public=true`. Free tier available. Requires `CRYPTOPANIC_API_TOKEN` env var.

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/sources/cryptopanic.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CryptoPanicSource } from '../../src/sources/cryptopanic.js'

const mockPost = (title: string, currency: string, publishedAt: string) => ({
  title,
  published_at: publishedAt,
  currencies: [{ code: currency }],
  url: 'https://example.com',
})

describe('CryptoPanicSource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns news signals from the API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          mockPost('Bitcoin ETF approved', 'BTC', '2024-01-10T12:00:00Z'),
          mockPost('Ethereum upgrade planned', 'ETH', '2024-01-10T11:00:00Z'),
        ],
      }),
    } as Response)

    const source = new CryptoPanicSource({ apiToken: 'test-token' })
    const signals = await source.fetch()

    expect(signals).toHaveLength(2)
    expect(signals[0].type).toBe('news')
    expect(signals[0].source).toBe('cryptopanic')
    expect(signals[0].coins).toContain('BTC/USDT')
    expect(signals[0].content).toContain('Bitcoin ETF approved')
  })

  it('returns empty array on API failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    const source = new CryptoPanicSource({ apiToken: 'test-token' })
    const signals = await source.fetch()

    expect(signals).toHaveLength(0)
  })

  it('maps currency codes to coin pairs', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [mockPost('SOL news', 'SOL', '2024-01-10T10:00:00Z')],
      }),
    } as Response)

    const source = new CryptoPanicSource({ apiToken: 'test-token' })
    const signals = await source.fetch()

    expect(signals[0].coins).toContain('SOL/USDT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/data && pnpm test tests/sources/cryptopanic.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/data/src/sources/cryptopanic.ts`**

```typescript
import type { Signal } from '@trader/shared'
import type { DataSource } from './base.js'

interface CryptoPanicPost {
  title: string
  published_at: string
  currencies: Array<{ code: string }>
  url: string
}

interface CryptoPanicResponse {
  results: CryptoPanicPost[]
}

interface CryptoPanicConfig {
  apiToken: string
}

export class CryptoPanicSource implements DataSource {
  readonly id = 'cryptopanic'
  private readonly apiToken: string
  private readonly baseUrl = 'https://cryptopanic.com/api/v1/posts'

  constructor(config: CryptoPanicConfig) {
    this.apiToken = config.apiToken
  }

  async fetch(): Promise<Signal[]> {
    try {
      const url = `${this.baseUrl}/?auth_token=${this.apiToken}&public=true`
      const res = await fetch(url)
      if (!res.ok) return []
      const body = (await res.json()) as CryptoPanicResponse
      return body.results.map(p => this.toSignal(p))
    } catch {
      return []
    }
  }

  async fetchHistorical(from: Date, to: Date): Promise<Signal[]> {
    try {
      const url = `${this.baseUrl}/?auth_token=${this.apiToken}&public=true&published_after=${from.toISOString()}&published_before=${to.toISOString()}`
      const res = await fetch(url)
      if (!res.ok) return []
      const body = (await res.json()) as CryptoPanicResponse
      return body.results.map(p => this.toSignal(p))
    } catch {
      return []
    }
  }

  private toSignal(post: CryptoPanicPost): Signal {
    const coins = post.currencies.map(c => `${c.code}/USDT`)
    return {
      source: this.id,
      type: 'news',
      content: post.title,
      timestamp: new Date(post.published_at),
      coins,
      raw: post,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/data && pnpm test tests/sources/cryptopanic.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Export from index**

Add to `packages/data/src/index.ts`:

```typescript
export { CryptoPanicSource } from './sources/cryptopanic.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/sources/cryptopanic.ts packages/data/tests/sources/cryptopanic.test.ts packages/data/src/index.ts
git commit -m "feat(data): add CryptoPanicSource for crypto news signals"
```

---

## Task 10: Integration smoke test + install deps

**Files:**
- Create: `tests/smoke.test.ts` (root-level integration test)

- [ ] **Step 1: Install workspace deps**

```bash
pnpm install
```

Expected: all packages linked, no errors.

- [ ] **Step 2: Write the failing smoke test**

Create `tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { TradingEngine } from '@trader/core'
import { Pipeline, NullDataSource, FearAndGreedSource } from '@trader/data'

describe('Integration smoke test', () => {
  it('Pipeline with NullDataSource produces empty WorldSnapshot', async () => {
    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals).toHaveLength(0)
    expect(snapshot.ohlcv).toEqual({})
    expect(snapshot.timestamp).toBeInstanceOf(Date)
  })

  it('TradingEngine executes a buy in paper mode given a WorldSnapshot', async () => {
    const engine = new TradingEngine({ totalCapital: 500, paper: true })

    const result = await engine.execute({
      action: 'buy',
      coin: 'BTC/USDT',
      size: 100,
      confidence: 0.85,
      reasoning: 'smoke test signal',
    })

    expect(result.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(1)
    expect(engine.availableCapital()).toBe(400)
  })

  it('TradingEngine respects capital cap', async () => {
    const engine = new TradingEngine({ totalCapital: 100, paper: true })

    const result = await engine.execute({
      action: 'buy',
      coin: 'ETH/USDT',
      size: 200,
      confidence: 0.9,
      reasoning: 'too large',
    })

    expect(result.executed).toBe(false)
    expect(engine.availableCapital()).toBe(100)
  })
})
```

- [ ] **Step 3: Build all packages first**

```bash
pnpm build
```

Expected: shared, core, data all build cleanly.

- [ ] **Step 4: Run smoke test**

```bash
pnpm test tests/smoke.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all tests across all packages PASS, no errors.

- [ ] **Step 6: Final commit**

```bash
git add tests/smoke.test.ts
git commit -m "test: add cross-package integration smoke test for pipeline + trading engine"
```

---

## What's Next

**Plan 1 delivers:** Working monorepo, type-safe shared contracts, paper-trading core engine with capital guard, and a fault-tolerant data pipeline with two live data sources.

**Note:** `binance-ohlcv.ts` (listed in file map) is deferred to Plan 4 (live execution), where ccxt and Binance credentials are set up. The `ohlcv` field in `WorldSnapshot` is populated then.

**Plan 2** adds the model-agnostic LLM adapter layer (Claude + OpenAI), prompt construction from `WorldSnapshot`, structured decision parsing, and wires `Pipeline → LLM → TradingEngine` into a single evaluation cycle.
