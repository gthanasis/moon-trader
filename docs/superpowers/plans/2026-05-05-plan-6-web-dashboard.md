# Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `packages/web` Next.js 14 dashboard that displays live positions, trade history, portfolio overview, and an interactive backtest runner, reading data from `@trader/db`.

**Architecture:** A Next.js 14 App Router package inside the monorepo (`packages/web`) that is the sole React package. Server Components fetch data directly from `@trader/db` repositories at request time; a single API route (`/api/positions`) supports client-side polling every 30 seconds for live position refresh. The backtest page uses a Server Action to invoke `BacktestRunner` inline, keeping the full result server-side until rendered.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui (components in `components/ui/`), recharts (P&L chart), `@trader/db` (Prisma repositories), `@trader/backtest` (server action), vitest (API route + server action tests)

---

## File Structure

```
packages/web/
  app/
    layout.tsx                  — root layout with navigation sidebar
    page.tsx                    — Overview page (Server Component)
    positions/
      page.tsx                  — Positions page (Server Component)
    trades/
      page.tsx                  — Trade History page (Server Component, paginated)
    backtest/
      page.tsx                  — Backtest page (client form + server action)
      actions.ts                — runBacktest() Server Action
    api/
      positions/
        route.ts                — GET /api/positions → JSON
  components/
    nav.tsx                     — sidebar navigation links
    stat-card.tsx               — reusable metric card (label + value)
    positions-table.tsx         — open positions table with auto-refresh
    trades-table.tsx            — closed trades table
    backtest-chart.tsx          — recharts P&L line chart
    ui/                         — shadcn/ui generated components
  lib/
    format.ts                   — shared number/date formatting helpers
  tests/
    api-positions.test.ts       — unit tests for /api/positions route handler
    actions.test.ts             — unit tests for runBacktest() server action
    format.test.ts              — unit tests for formatting helpers
  package.json
  tsconfig.json
  next.config.ts
  tailwind.config.ts
  postcss.config.js
```

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/next.config.ts`
- Create: `packages/web/tailwind.config.ts`
- Create: `packages/web/postcss.config.js`

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@trader/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@trader/db": "workspace:*",
    "@trader/backtest": "workspace:*",
    "@trader/shared": "workspace:*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install workspace dependencies**

```bash
cd /path/to/trader && pnpm install
```

- [ ] **Step 3: Create `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "outDir": ".next/types",
    "strict": true,
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `packages/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@trader/db', '@trader/backtest', '@trader/shared'],
}

export default nextConfig
```

- [ ] **Step 5: Create `packages/web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
```

- [ ] **Step 6: Create `packages/web/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Initialise shadcn/ui**

From inside `packages/web`, run the shadcn CLI. Accept defaults and point to the `components/ui` directory:

```bash
cd /path/to/trader/packages/web
pnpm dlx shadcn-ui@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: yes
- Tailwind config: `tailwind.config.ts`
- Components directory: `components/ui`
- Utils alias: `@/lib/utils`

Then add the specific components needed:

```bash
pnpm dlx shadcn-ui@latest add card table badge button input label select
```

- [ ] **Step 8: Create `packages/web/app/globals.css`** (Tailwind entry point — shadcn/ui init may generate this; if not, create it)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Commit scaffold**

```bash
git add packages/web/
git commit -m "feat(web): Next.js 14 package scaffold with shadcn/ui + Tailwind"
```

---

### Task 2: Shared components and formatting utilities

**Files:**
- Create: `packages/web/lib/format.ts`
- Create: `packages/web/tests/format.test.ts`
- Create: `packages/web/components/stat-card.tsx`
- Create: `packages/web/components/nav.tsx`

- [ ] **Step 1: Write failing tests for formatting helpers**

Create `packages/web/tests/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatUsd, formatPct, formatDuration } from '../lib/format'

describe('formatUsd', () => {
  it('formats positive value with dollar sign and two decimals', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
  })

  it('formats zero', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('formats negative value', () => {
    expect(formatUsd(-99.9)).toBe('-$99.90')
  })
})

describe('formatPct', () => {
  it('formats positive percentage', () => {
    expect(formatPct(12.345)).toBe('+12.35%')
  })

  it('formats negative percentage', () => {
    expect(formatPct(-5.1)).toBe('-5.10%')
  })

  it('formats zero', () => {
    expect(formatPct(0)).toBe('+0.00%')
  })
})

describe('formatDuration', () => {
  it('returns hours and minutes for durations under a day', () => {
    expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m')
  })

  it('returns days and hours for durations over a day', () => {
    expect(formatDuration(25 * 60 * 60 * 1000)).toBe('1d 1h')
  })

  it('returns "< 1m" for very short durations', () => {
    expect(formatDuration(30000)).toBe('< 1m')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: FAIL — `format` module not found.

- [ ] **Step 3: Create `packages/web/lib/format.ts`**

```typescript
export function formatUsd(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

export function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '< 1m'
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  return `${hours}h ${minutes % 60}m`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: all format tests PASS.

- [ ] **Step 5: Create `packages/web/components/stat-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StatCardProps {
  label: string
  value: string
  /** Optional color hint: 'positive' | 'negative' | 'neutral' */
  variant?: 'positive' | 'negative' | 'neutral'
}

export function StatCard({ label, value, variant = 'neutral' }: StatCardProps) {
  const valueClass =
    variant === 'positive'
      ? 'text-green-600'
      : variant === 'negative'
      ? 'text-red-600'
      : 'text-foreground'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Create `packages/web/components/nav.tsx`**

```tsx
import Link from 'next/link'

const links = [
  { href: '/', label: 'Overview' },
  { href: '/positions', label: 'Positions' },
  { href: '/trades', label: 'Trade History' },
  { href: '/backtest', label: 'Backtest' },
]

export function Nav() {
  return (
    <nav className="flex flex-col gap-1 p-4 border-r min-h-screen w-48">
      <span className="text-lg font-semibold mb-4 px-2">Trader</span>
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 7: Create `packages/web/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'

export const metadata: Metadata = {
  title: 'Trader Dashboard',
  description: 'LLM-driven crypto trading bot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <Nav />
        <main className="flex-1 p-6">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/lib/format.ts packages/web/tests/format.test.ts packages/web/components/ packages/web/app/layout.tsx packages/web/app/globals.css
git commit -m "feat(web): shared components (StatCard, Nav, layout) and formatting utilities"
```

---

### Task 3: Overview page

**Files:**
- Create: `packages/web/app/page.tsx`

The overview page is a Server Component. It reads data from `@trader/db` repositories directly — no `fetch()`, no client state.

- [ ] **Step 1: Create `packages/web/app/page.tsx`**

```tsx
import { tradeRepository, botStateRepository } from '@trader/db'
import { StatCard } from '@/components/stat-card'
import { formatUsd } from '@/lib/format'

export const revalidate = 30

export default async function OverviewPage() {
  const [recentTrades, openTrades, fearAndGreed] = await Promise.all([
    tradeRepository.findRecentTrades(100),
    tradeRepository.findOpenTrades(),
    botStateRepository.get('fearAndGreed') as Promise<number | null>,
  ])

  const totalPnl = recentTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const capitalDeployed = openTrades.reduce((sum, t) => sum + t.size, 0)

  const pnlVariant = totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : 'neutral'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total P&L"
          value={formatUsd(totalPnl)}
          variant={pnlVariant}
        />
        <StatCard
          label="Capital Deployed"
          value={formatUsd(capitalDeployed)}
        />
        <StatCard
          label="Open Positions"
          value={String(openTrades.length)}
        />
        <StatCard
          label="Fear & Greed"
          value={fearAndGreed != null ? String(fearAndGreed) : '—'}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /path/to/trader/packages/web && pnpm typecheck
```

Expected: no errors (assumes `@trader/db` is built and exported correctly per Plan 5 spec).

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/page.tsx
git commit -m "feat(web): Overview page — P&L, capital deployed, open positions, Fear & Greed"
```

---

### Task 4: Positions page

**Files:**
- Create: `packages/web/components/positions-table.tsx`
- Create: `packages/web/app/positions/page.tsx`

The positions page is a Server Component that revalidates every 30 seconds. The `PositionsTable` is a plain table component (no client-side state needed here — real-time refresh is handled separately in Task 7).

- [ ] **Step 1: Create `packages/web/components/positions-table.tsx`**

```tsx
import type { Trade } from '@trader/shared'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatUsd } from '@/lib/format'

// Plan 5 (@trader/db) returns Trade[] from findOpenTrades().
// The Trade type in @trader/shared does not carry stopLoss/takeProfit directly —
// those are on LLMDecision. Plan 5 may extend the DB Trade model to include them;
// if so, cast to ExtendedTrade below. For now the columns show '—' as a safe fallback.
interface ExtendedTrade extends Trade {
  stopLoss?: number
  takeProfit?: number
}

interface PositionsTableProps {
  positions: Trade[]
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return <p className="text-muted-foreground">No open positions.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coin</TableHead>
          <TableHead className="text-right">Entry Price</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead className="text-right">Stop Loss</TableHead>
          <TableHead className="text-right">Take Profit</TableHead>
          <TableHead>LLM Reasoning</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(positions as ExtendedTrade[]).map(pos => (
          <TableRow key={pos.id}>
            <TableCell className="font-medium">
              <Badge variant="outline">{pos.coin}</Badge>
            </TableCell>
            <TableCell className="text-right">{formatUsd(pos.entryPrice)}</TableCell>
            <TableCell className="text-right">{formatUsd(pos.size)}</TableCell>
            <TableCell className="text-right">
              {pos.stopLoss != null ? formatUsd(pos.stopLoss) : '—'}
            </TableCell>
            <TableCell className="text-right">
              {pos.takeProfit != null ? formatUsd(pos.takeProfit) : '—'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
              {pos.reasoning ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Create `packages/web/app/positions/page.tsx`**

```tsx
import { tradeRepository } from '@trader/db'
import { PositionsTable } from '@/components/positions-table'

export const revalidate = 30

export default async function PositionsPage() {
  const openTrades = await tradeRepository.findOpenTrades()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Open Positions</h1>
      <PositionsTable positions={openTrades} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/positions-table.tsx packages/web/app/positions/
git commit -m "feat(web): Positions page with server-rendered open positions table"
```

---

### Task 5: Trade History page

**Files:**
- Create: `packages/web/components/trades-table.tsx`
- Create: `packages/web/app/trades/page.tsx`

Pagination is implemented via a `page` search param. The table is sortable by date (default: most recent first).

- [ ] **Step 1: Create `packages/web/components/trades-table.tsx`**

```tsx
import type { Trade } from '@trader/shared'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatUsd, formatPct, formatDuration } from '@/lib/format'

interface TradesTableProps {
  trades: Trade[]
}

export function TradesTable({ trades }: TradesTableProps) {
  if (trades.length === 0) {
    return <p className="text-muted-foreground">No trades yet.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coin</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead>Reasoning</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map(trade => {
          const pnl = trade.pnl ?? 0
          const pnlVariant = pnl > 0 ? 'default' : 'destructive'
          const durationMs =
            trade.closedAt && trade.openedAt
              ? trade.closedAt.getTime() - trade.openedAt.getTime()
              : null

          return (
            <TableRow key={trade.id}>
              <TableCell className="font-medium">
                <Badge variant="outline">{trade.coin}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                  {trade.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatUsd(trade.entryPrice)}</TableCell>
              <TableCell className="text-right">
                {trade.exitPrice != null ? formatUsd(trade.exitPrice) : '—'}
              </TableCell>
              <TableCell className="text-right">
                {trade.pnl != null ? (
                  <span className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatUsd(pnl)}
                  </span>
                ) : '—'}
              </TableCell>
              <TableCell className="text-right">
                {durationMs != null ? formatDuration(durationMs) : '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                {trade.reasoning ?? '—'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Create `packages/web/app/trades/page.tsx`**

```tsx
import { tradeRepository } from '@trader/db'
import { TradesTable } from '@/components/trades-table'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const revalidate = 60

const PAGE_SIZE = 50

interface TradesPageProps {
  searchParams: { page?: string }
}

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const page = Math.max(1, Number(searchParams.page ?? '1'))
  const limit = PAGE_SIZE * page
  const trades = await tradeRepository.findRecentTrades(limit)
  const pageTrades = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasMore = trades.length === limit

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Trade History</h1>
      <TradesTable trades={pageTrades} />
      <div className="flex gap-2 mt-4">
        {page > 1 && (
          <Button variant="outline" asChild>
            <Link href={`/trades?page=${page - 1}`}>Previous</Link>
          </Button>
        )}
        {hasMore && (
          <Button variant="outline" asChild>
            <Link href={`/trades?page=${page + 1}`}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/trades-table.tsx packages/web/app/trades/
git commit -m "feat(web): Trade History page with paginated closed trades table"
```

---

### Task 6: Backtest page — form, server action, chart

**Files:**
- Create: `packages/web/app/backtest/actions.ts`
- Create: `packages/web/components/backtest-chart.tsx`
- Create: `packages/web/app/backtest/page.tsx`
- Create: `packages/web/tests/actions.test.ts`

The backtest server action accepts form data, constructs a `BacktestConfig`, calls `BacktestRunner.run()`, and returns `BacktestResult`. The page renders a config form and, after submission, a recharts P&L line chart plus a stats table.

- [ ] **Step 1: Write a failing test for the server action**

Create `packages/web/tests/actions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock @trader/backtest before importing actions
vi.mock('@trader/backtest', () => ({
  BacktestRunner: vi.fn().mockImplementation(() => ({
    run: vi.fn(async () => ({
      trades: [],
      stats: {
        totalPnl: 150,
        winRate: 0.6,
        maxDrawdown: 0.05,
        sharpeRatio: 1.2,
        avgHoldTimeMs: 3600000,
        totalTrades: 10,
      },
      pnlCurve: [
        { timestamp: new Date('2025-01-01'), capital: 1000 },
        { timestamp: new Date('2025-01-02'), capital: 1150 },
      ],
    })),
  })),
}))

// Mock @trader/db
vi.mock('@trader/db', () => ({
  candleRepository: {
    findCandles: vi.fn(async () => []),
  },
}))

// Mock @trader/llm
vi.mock('@trader/llm', () => ({
  ClaudeAdapter: vi.fn().mockImplementation(() => ({})),
}))

// Mock @trader/data
vi.mock('@trader/data', () => ({
  NullDataSource: vi.fn().mockImplementation(() => ({})),
}))

import { runBacktest } from '../app/backtest/actions'

describe('runBacktest server action', () => {
  it('returns BacktestResult for valid form data', async () => {
    const formData = new FormData()
    formData.set('from', '2025-01-01')
    formData.set('to', '2025-01-31')
    formData.set('initialCapital', '1000')
    formData.set('coins', 'BTC/USDT,ETH/USDT')
    formData.set('model', 'claude-haiku-4-5')

    const result = await runBacktest(formData)

    expect(result.stats.totalPnl).toBe(150)
    expect(result.stats.totalTrades).toBe(10)
    expect(result.pnlCurve).toHaveLength(2)
  })

  it('throws when from date is missing', async () => {
    const formData = new FormData()
    formData.set('to', '2025-01-31')
    formData.set('initialCapital', '1000')
    formData.set('coins', 'BTC/USDT')

    await expect(runBacktest(formData)).rejects.toThrow('from')
  })

  it('throws when to date is missing', async () => {
    const formData = new FormData()
    formData.set('from', '2025-01-01')
    formData.set('initialCapital', '1000')
    formData.set('coins', 'BTC/USDT')

    await expect(runBacktest(formData)).rejects.toThrow('to')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: FAIL — `actions` module not found.

- [ ] **Step 3: Create `packages/web/app/backtest/actions.ts`**

```typescript
'use server'

import { BacktestRunner } from '@trader/backtest'
import { candleRepository } from '@trader/db'
import { ClaudeAdapter } from '@trader/llm'
import { NullDataSource } from '@trader/data'
import type { BacktestResult } from '@trader/backtest'

function requireField(formData: FormData, field: string): string {
  const value = formData.get(field)
  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required field: ${field}`)
  }
  return value.trim()
}

export async function runBacktest(formData: FormData): Promise<BacktestResult> {
  const fromStr = requireField(formData, 'from')
  const toStr = requireField(formData, 'to')
  const initialCapital = Number(formData.get('initialCapital') ?? '1000')
  const coinsRaw = formData.get('coins')
  const coins = typeof coinsRaw === 'string' && coinsRaw.trim()
    ? coinsRaw.split(',').map(c => c.trim())
    : ['BTC/USDT', 'ETH/USDT']
  const model = (formData.get('model') as string | null) ?? 'claude-haiku-4-5'

  const from = new Date(fromStr)
  const to = new Date(toStr)

  // Load historical candles from DB for each coin
  const ohlcv: Record<string, import('@trader/shared').Candle[]> = {}
  await Promise.all(
    coins.map(async coin => {
      ohlcv[coin] = await candleRepository.findCandles(coin, from, to)
    })
  )

  const anthropicApiKey = process.env['ANTHROPIC_API_KEY']
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }

  const adapter = new ClaudeAdapter({ apiKey: anthropicApiKey, model })

  const runner = new BacktestRunner()
  return runner.run({
    from,
    to,
    initialCapital,
    autoTradeLimit: 50,
    coins,
    sources: [new NullDataSource()],
    ohlcv,
    adapter,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: all action tests PASS.

- [ ] **Step 5: Create `packages/web/components/backtest-chart.tsx`**

```tsx
'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PnlPoint } from '@trader/backtest'

interface BacktestChartProps {
  pnlCurve: PnlPoint[]
}

export function BacktestChart({ pnlCurve }: BacktestChartProps) {
  const data = pnlCurve.map(p => ({
    date: p.timestamp instanceof Date
      ? p.timestamp.toLocaleDateString()
      : new Date(p.timestamp).toLocaleDateString(),
    capital: p.capital,
  }))

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => `$${v.toLocaleString()}`}
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Capital']}
          />
          <Line
            type="monotone"
            dataKey="capital"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 6: Create `packages/web/app/backtest/page.tsx`**

This is a Client Component using `useActionState` from React 19 / Next.js 14 to manage form submission state and display results inline without a page reload.

```tsx
'use client'

import { useActionState } from 'react'
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
  const [state, formAction, isPending] = useActionState(backtestAction, initialState)

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
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Running…' : 'Run Backtest'}
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
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/backtest/ packages/web/components/backtest-chart.tsx packages/web/tests/actions.test.ts
git commit -m "feat(web): Backtest page with server action, recharts P&L curve, and stats"
```

---

### Task 7: Live position refresh API route + polling client component

**Files:**
- Create: `packages/web/app/api/positions/route.ts`
- Create: `packages/web/tests/api-positions.test.ts`
- Create: `packages/web/components/positions-live.tsx`
- Modify: `packages/web/app/positions/page.tsx`

The API route returns current open positions as JSON. A client component polls it every 30 seconds and replaces the table content with fresh data.

- [ ] **Step 1: Write a failing test for the API route handler**

Create `packages/web/tests/api-positions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @trader/db before importing the route
vi.mock('@trader/db', () => ({
  tradeRepository: {
    findOpenTrades: vi.fn(),
  },
}))

import { GET } from '../app/api/positions/route'
import { tradeRepository } from '@trader/db'

describe('GET /api/positions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns open trades as JSON with 200', async () => {
    const mockTrades = [
      {
        id: 'trade-1',
        coin: 'BTC/USDT',
        side: 'buy' as const,
        size: 200,
        entryPrice: 50000,
        openedAt: new Date('2025-01-01'),
        reasoning: 'bullish signal',
      },
    ]
    vi.mocked(tradeRepository.findOpenTrades).mockResolvedValue(mockTrades)

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json() as typeof mockTrades
    expect(body).toHaveLength(1)
    expect(body[0].coin).toBe('BTC/USDT')
  })

  it('returns empty array when no open trades', async () => {
    vi.mocked(tradeRepository.findOpenTrades).mockResolvedValue([])

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json() as unknown[]
    expect(body).toEqual([])
  })

  it('returns 500 when repository throws', async () => {
    vi.mocked(tradeRepository.findOpenTrades).mockRejectedValue(new Error('db error'))

    const response = await GET()

    expect(response.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Create `packages/web/app/api/positions/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { tradeRepository } from '@trader/db'

export async function GET(): Promise<NextResponse> {
  try {
    const positions = await tradeRepository.findOpenTrades()
    return NextResponse.json(positions, { status: 200 })
  } catch (_err) {
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: all tests PASS (format + actions + api-positions).

- [ ] **Step 5: Create `packages/web/components/positions-live.tsx`**

This is a Client Component that polls `/api/positions` every 30 seconds and re-renders the table with fresh data.

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { Trade } from '@trader/shared'
import { PositionsTable } from './positions-table'

interface PositionsLiveProps {
  /** Initial data rendered server-side to avoid layout shift on first load */
  initialPositions: Trade[]
}

export function PositionsLive({ initialPositions }: PositionsLiveProps) {
  const [positions, setPositions] = useState<Trade[]>(initialPositions)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/positions')
        if (res.ok) {
          const data = (await res.json()) as Trade[]
          setPositions(data)
          setLastUpdated(new Date())
        }
      } catch {
        // silently ignore network errors — stale data is acceptable
      }
    }

    const interval = setInterval(() => void poll(), 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Last updated: {lastUpdated.toLocaleTimeString()} (refreshes every 30s)
      </p>
      <PositionsTable positions={positions} />
    </div>
  )
}
```

- [ ] **Step 6: Update `packages/web/app/positions/page.tsx` to use `PositionsLive`**

```tsx
import { tradeRepository } from '@trader/db'
import { PositionsLive } from '@/components/positions-live'

// No revalidate needed — the client component polls independently
export default async function PositionsPage() {
  const openTrades = await tradeRepository.findOpenTrades()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Open Positions</h1>
      <PositionsLive initialPositions={openTrades} />
    </div>
  )
}
```

- [ ] **Step 7: Run all tests**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/api/ packages/web/tests/api-positions.test.ts packages/web/components/positions-live.tsx packages/web/app/positions/page.tsx
git commit -m "feat(web): live position refresh — GET /api/positions route + 30s polling client component"
```

---

### Task 8: Build verification and final wiring

**Files:**
- Modify: `package.json` (root) — ensure `@trader/web` is excluded from the `pnpm -r build` script since Next.js build is separate

- [ ] **Step 1: Verify `@trader/db` is built before starting the web package**

Build all prerequisite packages:

```bash
cd /path/to/trader
pnpm --filter '@trader/shared' build
pnpm --filter '@trader/db' build
pnpm --filter '@trader/backtest' build
```

- [ ] **Step 2: Run typecheck on the web package**

```bash
cd /path/to/trader/packages/web && pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run all web tests**

```bash
cd /path/to/trader/packages/web && pnpm test
```

Expected: all tests PASS (format, actions, api-positions).

- [ ] **Step 4: Verify Next.js build succeeds**

```bash
cd /path/to/trader/packages/web && pnpm build
```

Expected: Next.js build completes. Note: ANTHROPIC_API_KEY must be set for the backtest action to compile but is only read at runtime.

- [ ] **Step 5: Final commit**

```bash
git add packages/web/
git commit -m "feat(web): web dashboard build verified — typecheck, tests, and next build all pass"
```
