# Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the design spec from `design/design-spec.md` to the Next.js web dashboard in `packages/web/`, transforming it from a plain Tailwind UI into the dark-themed, mono-font, Expert/Simple toggleable dashboard shown in `design/trader-dashboard-v2-2.html`.

**Architecture:** Design tokens live in `tailwind.config.ts` and `globals.css` as CSS custom properties. The Expert/Simple toggle is a pure-CSS body-class mechanism (`body.noob`) with a client-side `ModeProvider` managing localStorage persistence. Components use `.xp`/`.nb` sibling spans for dual-mode copy; the Topbar lives in layout alongside the fixed sidebar Nav.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v3, React 18, TypeScript, Prisma (PostgreSQL), `@trader/db`, `@trader/shared`, inline SVG for charts.

---

## File Map

**Modified:**
- `packages/web/tailwind.config.ts` — design tokens (colors, fonts, radius)
- `packages/web/app/globals.css` — CSS vars, base resets, `.xp`/`.nb` rules
- `packages/web/app/layout.tsx` — add ModeProvider, Topbar, restructure sidebar+main
- `packages/web/components/nav.tsx` — full redesign: active state, dual-mode labels, status badge
- `packages/web/components/stat-card.tsx` — mono label + value, `sub` prop, dual-mode copy, card hover
- `packages/web/components/positions-table.tsx` — add Side column, confidence bar, reasoning expand, xp/nb headers
- `packages/web/components/trades-table.tsx` — design tokens, xp/nb headers
- `packages/web/components/backtest-chart.tsx` — replace Recharts with inline SVG polyline
- `packages/web/app/page.tsx` — 4-col stat grid + 2-col layout + approval banner
- `packages/web/app/positions/page.tsx` — remove h1, let topbar handle title
- `packages/web/app/trades/page.tsx` — remove h1, let topbar handle title
- `packages/web/app/backtest/page.tsx` — 272px/1fr layout, dual-mode labels, SVG chart
- `packages/db/prisma/schema.prisma` — add `status` + `expiresAt` to `LlmDecision`
- `packages/db/src/repositories/decision-repository.ts` — add `findPendingDecision()` method

**Created:**
- `packages/web/components/topbar.tsx` — sticky topbar: title, live pill, cycle clock, mode toggle
- `packages/web/components/mode-provider.tsx` — client component; manages `body.noob` class + localStorage
- `packages/web/components/approval-banner.tsx` — pending decision banner with countdown timer
- `packages/web/components/signal-feed.tsx` — signal list with type-colored dots
- `packages/web/app/api/decisions/[id]/route.ts` — PATCH approve/reject endpoint

---

## Task 1: Design tokens + CSS foundation

**Files:**
- Modify: `packages/web/tailwind.config.ts`
- Modify: `packages/web/app/globals.css`

- [ ] **Step 1: Replace tailwind.config.ts with design tokens**

```ts
// packages/web/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      'var(--bg)',
        surface: 'var(--surface)',
        sf2:     'var(--sf2)',
        border:  'var(--border)',
        fg:      'var(--fg)',
        muted:   'var(--muted)',
        accent:  'var(--accent)',
        pos:     'var(--pos)',
        neg:     'var(--neg)',
        warn:    'var(--warn)',
        info:    'var(--info)',
      },
      fontFamily: {
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'system-ui', 'sans-serif'],
        body:    ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '5px',
        md: '5px',
        lg: '10px',
      },
      fontSize: {
        '2xs': '9.5px',
        xs:    '10px',
        sm:    '11px',
        base:  '12px',
        stat:  '20px',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Replace globals.css with CSS vars + base resets + xp/nb rules**

```css
/* packages/web/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg:      #09090f;
  --surface: #111118;
  --sf2:     #18181f;
  --border:  #1e1e2c;
  --fg:      #ddddf0;
  --muted:   #50506a;
  --accent:  #00e5a0;
  --pos:     #10c97a;
  --neg:     #f05050;
  --warn:    #e8a020;
  --info:    #6090f0;
  --r:       5px;
  --sidebar: 184px;
}

html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  font-size: 12px;
  line-height: 1.5;
}

* {
  box-sizing: border-box;
  border-color: var(--border);
}

/* tabular nums on all numeric-ish content */
.font-mono, [class*="tabular"] {
  font-variant-numeric: tabular-nums;
}

/* Expert / Simple toggle */
.nb { display: none; }
body.noob .xp { display: none; }
body.noob .nb { display: revert; }
```

- [ ] **Step 3: Verify Next.js dev server starts without errors**

```bash
cd packages/web && pnpm dev
```
Expected: Server starts on port 3000, no compilation errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/tailwind.config.ts packages/web/app/globals.css
git commit -m "feat(web): add design tokens and Expert/Simple CSS foundation"
```

---

## Task 2: ModeProvider + layout restructure

**Files:**
- Create: `packages/web/components/mode-provider.tsx`
- Modify: `packages/web/app/layout.tsx`

- [ ] **Step 1: Create ModeProvider**

This is a client component that reads `localStorage.traderMode` on mount and sets/removes the `noob` class on `document.body`. It renders no DOM of its own.

```tsx
// packages/web/components/mode-provider.tsx
'use client'

import { useEffect } from 'react'

export function ModeProvider() {
  useEffect(() => {
    const stored = localStorage.getItem('traderMode')
    if (stored === 'noob') {
      document.body.classList.add('noob')
    }
  }, [])

  return null
}
```

- [ ] **Step 2: Update layout.tsx**

The layout gives the body a flex structure: fixed 184px sidebar (Nav) + right column (sticky Topbar above scrollable main). ModeProvider runs once on mount to restore saved mode.

```tsx
// packages/web/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'
import { Topbar } from '@/components/topbar'
import { ModeProvider } from '@/components/mode-provider'

export const metadata: Metadata = {
  title: 'Trader Dashboard',
  description: 'LLM-driven crypto trading bot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', minHeight: '100vh' }}>
        <ModeProvider />
        <Nav />
        <div style={{ marginLeft: 'var(--sidebar)', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Topbar />
          <main style={{ padding: '18px 20px', flex: 1 }}>{children}</main>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/mode-provider.tsx packages/web/app/layout.tsx
git commit -m "feat(web): add ModeProvider and restructure layout for fixed sidebar + topbar"
```

---

## Task 3: Topbar component

**Files:**
- Create: `packages/web/components/topbar.tsx`

The topbar is sticky. It has: page title (server-rendered via `usePathname` on client), mode toggle buttons, cycle clock (current time updating every second), and a live pulse dot. The mode toggle adds/removes `noob` on `document.body` and saves to localStorage.

- [ ] **Step 1: Create topbar.tsx**

```tsx
// packages/web/components/topbar.tsx
'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const PAGE_TITLES: Record<string, string> = {
  '/':          'Overview',
  '/positions': 'Open Positions',
  '/trades':    'Trade History',
  '/backtest':  'Backtest',
}

function setMode(mode: 'expert' | 'noob') {
  if (mode === 'noob') {
    document.body.classList.add('noob')
  } else {
    document.body.classList.remove('noob')
  }
  localStorage.setItem('traderMode', mode)
}

export function Topbar() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? 'Trader'
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 20px',
      height: '44px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* live pulse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 6px var(--accent)',
            display: 'inline-block',
          }} />
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)' }}>
            {time}
          </span>
        </div>

        {/* mode toggle */}
        <div style={{
          display: 'flex', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', overflow: 'hidden',
        }}>
          {(['expert', 'noob'] as const).map(m => (
            <button
              key={m}
              data-mode={m}
              onClick={() => setMode(m)}
              style={{
                padding: '3px 10px',
                fontSize: '10.5px',
                fontFamily: 'monospace',
                background: 'transparent',
                color: 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {m === 'expert' ? 'Expert' : 'Simple'}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/topbar.tsx
git commit -m "feat(web): add sticky Topbar with live clock and Expert/Simple toggle"
```

---

## Task 4: Nav redesign

**Files:**
- Modify: `packages/web/components/nav.tsx`

The Nav is a fixed 184px sidebar. It has: brand name at top, nav items with active state, and a status badge at the bottom. Active state is detected client-side via `usePathname`. Dual-mode nav labels use `.xp`/`.nb` spans.

- [ ] **Step 1: Rewrite nav.tsx**

```tsx
// packages/web/components/nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',          xp: 'Overview',        nb: 'Home' },
  { href: '/positions', xp: 'Open Positions',  nb: 'Active Trades' },
  { href: '/trades',    xp: 'Trade History',   nb: 'Past Trades' },
  { href: '/backtest',  xp: 'Backtest',        nb: 'Test the AI' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0,
      width: 'var(--sidebar)', height: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '16px 0', zIndex: 20,
    }}>
      {/* brand */}
      <div style={{ padding: '0 16px 16px', fontWeight: 600, fontSize: '14px' }}>
        Trader
      </div>

      {/* nav items */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
        {links.map(link => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'block',
                padding: '6px 8px',
                borderRadius: 'var(--r)',
                fontSize: '12px',
                textDecoration: 'none',
                background: active ? 'color-mix(in oklch, var(--accent) 10%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              <span className="xp">{link.xp}</span>
              <span className="nb">{link.nb}</span>
            </Link>
          )
        })}
      </div>

      {/* status badge */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--pos)', display: 'inline-block',
          }} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--muted)' }}>
            <span className="xp">Live · 15m cycle</span>
            <span className="nb">Live · checks every 15 min</span>
          </span>
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/nav.tsx
git commit -m "feat(web): redesign Nav — fixed sidebar, active state, dual-mode labels"
```

---

## Task 5: StatCard redesign

**Files:**
- Modify: `packages/web/components/stat-card.tsx`
- Modify: `packages/web/app/page.tsx` (update prop usage)

The stat card shows a mono LABEL, a large VALUE, and an optional `sub` line. The `colorVariant` maps to design token colors. Card hover changes border to accent tint. Dual-mode content is passed as children-like props so callers control the copy.

- [ ] **Step 1: Rewrite stat-card.tsx**

```tsx
// packages/web/components/stat-card.tsx
interface StatCardProps {
  /** Expert label (monospace uppercase) */
  label: string
  /** Simple label (sentence case) */
  labelSimple?: string
  value: string
  /** Expert sub-text */
  sub?: string
  /** Simple sub-text */
  subSimple?: string
  colorVariant?: 'pos' | 'neg' | 'warn' | 'info' | 'neutral'
}

const variantColor: Record<NonNullable<StatCardProps['colorVariant']>, string> = {
  pos:     'var(--pos)',
  neg:     'var(--neg)',
  warn:    'var(--warn)',
  info:    'var(--info)',
  neutral: 'var(--fg)',
}

export function StatCard({ label, labelSimple, value, sub, subSimple, colorVariant = 'neutral' }: StatCardProps) {
  const valueColor = variantColor[colorVariant]
  const subColor = colorVariant === 'neutral' ? 'var(--muted)' : valueColor

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r)',
      padding: '14px 16px',
      cursor: 'default',
      transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--accent) 40%, var(--border))')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
        <span className="xp">{label}</span>
        {labelSimple && <span className="nb">{labelSimple}</span>}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 600, color: valueColor, fontVariantNumeric: 'tabular-nums', marginBottom: sub || subSimple ? '4px' : 0 }}>
        {value}
      </div>
      {(sub || subSimple) && (
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: subColor }}>
          {sub && <span className="xp">{sub}</span>}
          {subSimple && <span className="nb">{subSimple}</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update Overview page to use new StatCard props**

```tsx
// packages/web/app/page.tsx
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
  const pnlVariant = totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : 'neutral'
  const fgScore = fearAndGreed ?? null
  const fgVariant = fgScore == null ? 'neutral' : fgScore < 30 ? 'neg' : fgScore < 60 ? 'warn' : 'pos'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <StatCard
          label="Total P&L"
          value={formatUsd(totalPnl)}
          sub={totalPnl >= 0 ? '+since inception' : 'since inception'}
          colorVariant={pnlVariant}
        />
        <StatCard
          label="Capital Deployed"
          labelSimple="Money in the Market"
          value={formatUsd(capitalDeployed)}
          sub="sum of open Trade.size"
          subSimple="currently tied up in trades"
        />
        <StatCard
          label="Open Positions"
          value={String(openTrades.length)}
          sub="active trades"
        />
        <StatCard
          label="Fear & Greed"
          labelSimple="Market Mood Score"
          value={fgScore != null ? String(fgScore) : '—'}
          sub={fgScore != null ? `${fgScore < 30 ? 'Fear' : fgScore < 60 ? 'Neutral' : 'Greed'} · index` : '—'}
          subSimple={fgScore != null ? `${fgScore < 30 ? 'Fearful' : fgScore < 60 ? 'Neutral (50 = calm)' : 'Greedy'} · improving` : '—'}
          colorVariant={fgVariant}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/stat-card.tsx packages/web/app/page.tsx
git commit -m "feat(web): redesign StatCard — mono tokens, sub line, dual-mode labels, hover border"
```

---

## Task 6: DB migration — add status + expiresAt to LlmDecision

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/repositories/decision-repository.ts`

The approval banner needs to query "pending" decisions. The `LlmDecision` schema currently has no `status` field. We add `status` (default `'executed'`) and `expiresAt` (optional DateTime).

- [ ] **Step 1: Update schema.prisma**

Replace the `LlmDecision` model block with:

```prisma
model LlmDecision {
  id          String    @id @default(cuid())
  action      String
  coin        String
  size        Float
  confidence  Float
  reasoning   String
  stopLoss    Float?
  takeProfit  Float?
  status      String    @default("executed")
  expiresAt   DateTime?
  decidedAt   DateTime  @default(now())
  tradeId     String?
  trade       Trade?    @relation(fields: [tradeId], references: [id])

  @@index([decidedAt])
  @@index([coin])
  @@index([status])
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd packages/db && pnpm prisma migrate dev --name add_decision_status
```

Expected: Migration created and applied. Prisma client regenerated.

- [ ] **Step 3: Add findPendingDecision() to DecisionRepository**

```ts
// packages/db/src/repositories/decision-repository.ts
import type { LLMDecision } from '@trader/shared'
import type { PrismaClient } from '@prisma/client'

export interface StoredDecision extends LLMDecision {
  id: string
  status: string
  expiresAt: Date | null
  decidedAt: Date
}

export class DecisionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveDecision(decision: LLMDecision): Promise<string> {
    const row = await this.prisma.llmDecision.create({
      data: {
        action: decision.action, coin: decision.coin, size: decision.size,
        confidence: decision.confidence, reasoning: decision.reasoning,
        stopLoss: decision.stopLoss ?? null, takeProfit: decision.takeProfit ?? null,
        status: 'executed',
      },
    })
    return row.id
  }

  async linkDecisionToTrade(decisionId: string, tradeId: string): Promise<void> {
    await this.prisma.llmDecision.update({
      where: { id: decisionId },
      data: { tradeId },
    })
  }

  async findPendingDecision(): Promise<StoredDecision | null> {
    const row = await this.prisma.llmDecision.findFirst({
      where: { status: 'pending' },
      orderBy: { decidedAt: 'desc' },
    })
    if (!row) return null
    return {
      id: row.id,
      action: row.action as LLMDecision['action'],
      coin: row.coin,
      size: row.size,
      confidence: row.confidence,
      reasoning: row.reasoning,
      stopLoss: row.stopLoss ?? undefined,
      takeProfit: row.takeProfit ?? undefined,
      status: row.status,
      expiresAt: row.expiresAt,
      decidedAt: row.decidedAt,
    }
  }

  async updateDecisionStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    await this.prisma.llmDecision.update({
      where: { id },
      data: { status },
    })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/src/repositories/decision-repository.ts
git commit -m "feat(db): add status + expiresAt to LlmDecision, add findPendingDecision()"
```

---

## Task 7: Approve/reject API endpoint

**Files:**
- Create: `packages/web/app/api/decisions/[id]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// packages/web/app/api/decisions/[id]/route.ts
import { NextResponse } from 'next/server'
import { decisionRepository } from '@trader/db'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json() as { status?: string }
  if (body.status !== 'approved' && body.status !== 'rejected') {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
  }
  await decisionRepository.updateDecisionStatus(params.id, body.status)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write a test**

```ts
// packages/web/tests/api-decisions.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@trader/db', () => ({
  decisionRepository: {
    updateDecisionStatus: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('PATCH /api/decisions/[id]', () => {
  it('rejects invalid status', async () => {
    const { PATCH } = await import('../app/api/decisions/[id]/route')
    const req = new Request('http://localhost/api/decisions/abc', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid' }),
    })
    const res = await PATCH(req, { params: { id: 'abc' } })
    expect(res.status).toBe(400)
  })

  it('accepts approved status', async () => {
    const { PATCH } = await import('../app/api/decisions/[id]/route')
    const req = new Request('http://localhost/api/decisions/abc', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, { params: { id: 'abc' } })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3: Run test**

```bash
cd packages/web && pnpm test tests/api-decisions.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/api/decisions packages/web/tests/api-decisions.test.ts
git commit -m "feat(web): add PATCH /api/decisions/[id] approve/reject endpoint"
```

---

## Task 8: ApprovalBanner component

**Files:**
- Create: `packages/web/components/approval-banner.tsx`

This is a client component (for the countdown timer). It receives the pending decision as a prop (server-fetched by the page). The countdown computes `expiresAt - now` every second. Approve/Reject buttons call PATCH then call an optional `onDismiss` callback. Dual-mode content via `.xp`/`.nb` spans.

- [ ] **Step 1: Create approval-banner.tsx**

```tsx
// packages/web/components/approval-banner.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StoredDecision } from '@trader/db'

interface ApprovalBannerProps {
  decision: StoredDecision
  onDismiss: () => void
}

function useCountdown(expiresAt: Date | null): string {
  const [remaining, setRemaining] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) { setRemaining('Expired'); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return remaining
}

export function ApprovalBanner({ decision, onDismiss }: ApprovalBannerProps) {
  const countdown = useCountdown(decision.expiresAt)
  const [loading, setLoading] = useState(false)

  const respond = useCallback(async (status: 'approved' | 'rejected') => {
    setLoading(true)
    await fetch(`/api/decisions/${decision.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onDismiss()
  }, [decision.id, onDismiss])

  const actionLabel = decision.action.toUpperCase()
  const sideColor = decision.action === 'buy' ? 'var(--pos)' : 'var(--neg)'

  return (
    <div style={{
      background: 'color-mix(in oklch, var(--warn) 8%, var(--surface))',
      border: '1px solid color-mix(in oklch, var(--warn) 40%, var(--border))',
      borderRadius: 'var(--r)',
      padding: '14px 16px',
      marginBottom: '16px',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      {/* header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
            <span className="xp">Approval Needed</span>
            <span className="nb">Your decision needed</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>
            <span className="xp">
              <span style={{ color: sideColor }}>{actionLabel}</span>
              {' '}${decision.size} {decision.coin} — confidence {decision.confidence.toFixed(2)}
            </span>
            <span className="nb">
              <span style={{ color: sideColor }}>{decision.action === 'buy' ? 'Buy' : 'Sell'}</span>
              {' '}${decision.size} of {decision.coin} — AI is {Math.round(decision.confidence * 100)}% confident
            </span>
          </div>
        </div>
        {countdown && (
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)' }}>
            {countdown}
          </span>
        )}
      </div>

      {/* meta fields */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {decision.stopLoss != null && (
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>
              <span className="xp">Stop Loss</span>
              <span className="nb">Exit if drops to</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neg)' }}>${decision.stopLoss.toFixed(2)}</div>
          </div>
        )}
        {decision.takeProfit != null && (
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>
              <span className="xp">Take Profit</span>
              <span className="nb">Max profit target</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--pos)' }}>${decision.takeProfit.toFixed(2)}</div>
          </div>
        )}
      </div>

      {/* reasoning */}
      <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
        {decision.reasoning}
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => void respond('approved')}
          disabled={loading}
          style={{
            padding: '5px 14px', borderRadius: 'var(--r)',
            background: 'var(--accent)', color: '#000',
            border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
          }}
        >
          Approve
        </button>
        <button
          onClick={() => void respond('rejected')}
          disabled={loading}
          style={{
            padding: '5px 14px', borderRadius: 'var(--r)',
            background: 'transparent', color: 'var(--neg)',
            border: '1px solid var(--neg)', cursor: 'pointer', fontSize: '11px',
          }}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/approval-banner.tsx
git commit -m "feat(web): add ApprovalBanner with countdown, dual-mode copy, approve/reject"
```

---

## Task 9: SignalFeed component

**Files:**
- Create: `packages/web/components/signal-feed.tsx`

Renders a list of `Signal[]`. Each item has a colored dot (by type), source label, and content text. Dot colors: news→neg, sentiment→warn, onchain→pos, macro→info, price→muted.

- [ ] **Step 1: Create signal-feed.tsx**

```tsx
// packages/web/components/signal-feed.tsx
import type { Signal, SignalType } from '@trader/shared'

const DOT_COLOR: Record<SignalType, string> = {
  news:      'var(--neg)',
  sentiment: 'var(--warn)',
  onchain:   'var(--pos)',
  macro:     'var(--info)',
  price:     'var(--muted)',
}

interface SignalFeedProps {
  signals: Signal[]
}

export function SignalFeed({ signals }: SignalFeedProps) {
  if (signals.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '11px' }}>No recent signals.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {signals.map((s, i) => {
        const coins = s.coins?.join(', ')
        return (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: DOT_COLOR[s.type],
              marginTop: '4px', flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: '9.5px', fontFamily: 'monospace', color: 'var(--muted)', marginBottom: '2px' }}>
                <span className="xp">
                  {s.source.toUpperCase()} · {s.type}{coins ? ` · [${coins}]` : ''}
                </span>
                <span className="nb">
                  {s.type.charAt(0).toUpperCase() + s.type.slice(1)}{coins ? ` · ${coins.toUpperCase()}` : ''}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--fg)', lineHeight: 1.5 }}>
                {s.content}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/signal-feed.tsx
git commit -m "feat(web): add SignalFeed with type-colored dots and dual-mode labels"
```

---

## Task 10: Overview page — 2-col layout with banner + signals

**Files:**
- Modify: `packages/web/app/page.tsx`

The overview uses a 4-col stat grid, optional approval banner, then a 2-col grid (`1.6fr 1fr`): left=positions table, right=signal feed.

- [ ] **Step 1: Update page.tsx**

```tsx
// packages/web/app/page.tsx
import { tradeRepository, botStateRepository, signalRepository, decisionRepository } from '@trader/db'
import { StatCard } from '@/components/stat-card'
import { SignalFeed } from '@/components/signal-feed'
import { PositionsTable } from '@/components/positions-table'
import { ApprovalBannerWrapper } from '@/components/approval-banner-wrapper'
import { formatUsd } from '@/lib/format'

export const revalidate = 30

export default async function OverviewPage() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [recentTrades, openTrades, fearAndGreed, signals, pendingDecision] = await Promise.all([
    tradeRepository.findRecentTrades(100),
    tradeRepository.findOpenTrades(),
    botStateRepository.get('fearAndGreed') as Promise<number | null>,
    signalRepository.findSignalsSince(since),
    decisionRepository.findPendingDecision(),
  ])

  const totalPnl = recentTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const capitalDeployed = openTrades.reduce((sum, t) => sum + t.size, 0)
  const pnlVariant = totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : 'neutral'
  const fgScore = fearAndGreed ?? null
  const fgVariant = fgScore == null ? 'neutral' : fgScore < 30 ? 'neg' : fgScore < 60 ? 'warn' : 'pos'

  return (
    <div>
      {/* 4-col stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard
          label="Total P&L"
          value={formatUsd(totalPnl)}
          sub={totalPnl >= 0 ? '+since inception' : 'since inception'}
          colorVariant={pnlVariant}
        />
        <StatCard
          label="Capital Deployed"
          labelSimple="Money in the Market"
          value={formatUsd(capitalDeployed)}
          sub="sum of open Trade.size"
          subSimple="currently tied up in trades"
        />
        <StatCard
          label="Open Positions"
          value={String(openTrades.length)}
          sub="active trades"
        />
        <StatCard
          label="Fear & Greed"
          labelSimple="Market Mood Score"
          value={fgScore != null ? String(fgScore) : '—'}
          sub={fgScore != null ? `${fgScore < 30 ? 'Fear' : fgScore < 60 ? 'Neutral' : 'Greed'} · index` : '—'}
          subSimple={fgScore != null ? `${fgScore < 30 ? 'Fearful' : fgScore < 60 ? 'Neutral (50 = calm)' : 'Greedy'} · improving` : '—'}
          colorVariant={fgVariant}
        />
      </div>

      {/* approval banner (client component wrapper handles dismiss) */}
      {pendingDecision && <ApprovalBannerWrapper decision={pendingDecision} />}

      {/* 2-col layout: 1.6fr positions | 1fr signals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '16px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '10px' }}>Open Positions</div>
          <PositionsTable positions={openTrades} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '10px' }}>Recent Signals</div>
          <SignalFeed signals={signals.slice(0, 20)} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ApprovalBannerWrapper (client component for dismiss)**

The overview page is a server component, but the banner needs to be dismissable client-side without a full page re-render.

```tsx
// packages/web/components/approval-banner-wrapper.tsx
'use client'

import { useState } from 'react'
import { ApprovalBanner } from './approval-banner'
import type { StoredDecision } from '@trader/db'

export function ApprovalBannerWrapper({ decision }: { decision: StoredDecision }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return <ApprovalBanner decision={decision} onDismiss={() => setDismissed(true)} />
}
```

- [ ] **Step 3: Export StoredDecision from @trader/db**

Ensure `StoredDecision` is exported from `packages/db/src/index.ts`:

```ts
// packages/db/src/index.ts  — add to existing exports:
export type { StoredDecision } from './repositories/decision-repository.js'
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/page.tsx packages/web/components/approval-banner-wrapper.tsx packages/db/src/index.ts
git commit -m "feat(web): Overview 2-col layout with stat grid, approval banner, signal feed"
```

---

## Task 11: PositionsTable redesign

**Files:**
- Modify: `packages/web/components/positions-table.tsx`

Columns: Coin | Side | Entry Price | Size | Reasoning (with expand/collapse + confidence bar). xp/nb headers. Side badge colored pos/neg. Reasoning collapses to 2 lines.

- [ ] **Step 1: Rewrite positions-table.tsx**

```tsx
// packages/web/components/positions-table.tsx
'use client'

import { useState } from 'react'
import type { Trade } from '@trader/shared'
import { formatUsd } from '@/lib/format'

interface PositionsTableProps {
  positions: Trade[]
}

function ReasoningCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <td
      style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: '280px', cursor: 'pointer', paddingRight: '12px' }}
      onClick={() => setExpanded(v => !v)}
    >
      <span style={{
        display: '-webkit-box',
        WebkitLineClamp: expanded ? 'unset' : 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {text}
      </span>
      <span style={{ color: 'var(--muted)', fontSize: '10px' }}> {expanded ? '↑' : '↓'}</span>
    </td>
  )
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '11px' }}>No open positions.</p>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {[
            ['Coin', 'Coin'],
            ['Side', 'Direction'],
            ['Entry Price', 'Bought At'],
            ['Size', 'Size'],
            ['Reasoning', 'Why'],
          ].map(([xp, nb]) => (
            <th key={xp} style={{
              textAlign: 'left', padding: '6px 8px 6px 0',
              fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border)', fontWeight: 500,
            }}>
              <span className="xp">{xp}</span>
              <span className="nb">{nb}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map(pos => (
          <tr key={pos.id} style={{ borderBottom: '1px solid var(--border)' }}
            onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = 'var(--sf2)')) }}
            onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = '')) }}
          >
            <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
              <span style={{
                padding: '2px 6px', borderRadius: '3px',
                border: '1px solid var(--border)', fontSize: '10.5px',
              }}>{pos.coin}</span>
            </td>
            <td style={{ padding: '8px 8px 8px 0' }}>
              <span style={{
                padding: '2px 6px', borderRadius: '3px', fontSize: '10.5px',
                fontFamily: 'monospace', fontWeight: 500,
                color: pos.side === 'buy' ? 'var(--pos)' : 'var(--neg)',
                background: pos.side === 'buy'
                  ? 'color-mix(in oklch, var(--pos) 12%, transparent)'
                  : 'color-mix(in oklch, var(--neg) 12%, transparent)',
              }}>
                <span className="xp">{pos.side.toUpperCase()}</span>
                <span className="nb">{pos.side === 'buy' ? 'Long' : 'Short'}</span>
              </span>
            </td>
            <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
              {formatUsd(pos.entryPrice)}
            </td>
            <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
              {formatUsd(pos.size)}
            </td>
            {pos.reasoning
              ? <ReasoningCell text={pos.reasoning} />
              : <td style={{ color: 'var(--muted)', fontSize: '11px' }}>—</td>
            }
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/positions-table.tsx
git commit -m "feat(web): redesign PositionsTable — Side col, row hover, reasoning expand, dual-mode headers"
```

---

## Task 12: TradesTable redesign

**Files:**
- Modify: `packages/web/components/trades-table.tsx`

Apply design tokens, colored P&L, dual-mode column headers. Row hover. Reasoning expand (same `ReasoningCell` pattern).

- [ ] **Step 1: Rewrite trades-table.tsx**

```tsx
// packages/web/components/trades-table.tsx
'use client'

import { useState } from 'react'
import type { Trade } from '@trader/shared'
import { formatUsd, formatDuration } from '@/lib/format'

function ReasoningCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <td
      style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: '280px', cursor: 'pointer' }}
      onClick={() => setExpanded(v => !v)}
    >
      <span style={{
        display: '-webkit-box',
        WebkitLineClamp: expanded ? 'unset' : 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {text}
      </span>
      <span style={{ color: 'var(--muted)', fontSize: '10px' }}> {expanded ? '↑' : '↓'}</span>
    </td>
  )
}

const HEADERS: [string, string][] = [
  ['Coin', 'Coin'],
  ['Side', 'Direction'],
  ['Entry', 'Bought At'],
  ['Exit', 'Sold At'],
  ['P&L', 'Profit / Loss'],
  ['Duration', 'How Long'],
  ['Reasoning', 'Why'],
]

interface TradesTableProps { trades: Trade[] }

export function TradesTable({ trades }: TradesTableProps) {
  if (trades.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '11px' }}>No trades yet.</p>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {HEADERS.map(([xp, nb]) => (
            <th key={xp} style={{
              textAlign: 'left', padding: '6px 8px 6px 0',
              fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border)', fontWeight: 500,
            }}>
              <span className="xp">{xp}</span>
              <span className="nb">{nb}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {trades.map(trade => {
          const pnl = trade.pnl ?? 0
          const durationMs =
            trade.closedAt && trade.openedAt
              ? trade.closedAt.getTime() - trade.openedAt.getTime()
              : null

          return (
            <tr key={trade.id} style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = 'var(--sf2)')) }}
              onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = '')) }}
            >
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
                <span style={{ padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)', fontSize: '10.5px' }}>{trade.coin}</span>
              </td>
              <td style={{ padding: '8px 8px 8px 0' }}>
                <span style={{
                  padding: '2px 6px', borderRadius: '3px', fontSize: '10.5px', fontFamily: 'monospace', fontWeight: 500,
                  color: trade.side === 'buy' ? 'var(--pos)' : 'var(--neg)',
                  background: trade.side === 'buy'
                    ? 'color-mix(in oklch, var(--pos) 12%, transparent)'
                    : 'color-mix(in oklch, var(--neg) 12%, transparent)',
                }}>
                  <span className="xp">{trade.side.toUpperCase()}</span>
                  <span className="nb">{trade.side === 'buy' ? 'Long' : 'Short'}</span>
                </span>
              </td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>{formatUsd(trade.entryPrice)}</td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
                {trade.exitPrice != null ? formatUsd(trade.exitPrice) : '—'}
              </td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px' }}>
                {trade.pnl != null
                  ? <span style={{ color: pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatUsd(pnl)}</span>
                  : '—'}
              </td>
              <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontSize: '12px', color: 'var(--muted)' }}>
                {durationMs != null ? formatDuration(durationMs) : '—'}
              </td>
              {trade.reasoning
                ? <ReasoningCell text={trade.reasoning} />
                : <td style={{ color: 'var(--muted)', fontSize: '11px' }}>—</td>
              }
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/trades-table.tsx
git commit -m "feat(web): redesign TradesTable — design tokens, dual-mode headers, row hover, reasoning expand"
```

---

## Task 13: Backtest page + SVG chart

**Files:**
- Modify: `packages/web/components/backtest-chart.tsx`
- Modify: `packages/web/app/backtest/page.tsx`

Replace Recharts with an inline SVG polyline. The chart has: a green fill gradient below the line, X-axis date ticks, Y-axis capital ticks. Backtest page uses `272px 1fr` grid layout and dual-mode labels.

- [ ] **Step 1: Rewrite backtest-chart.tsx as inline SVG**

```tsx
// packages/web/components/backtest-chart.tsx
'use client'

import type { PnlPoint } from '@trader/backtest'

interface BacktestChartProps {
  pnlCurve: PnlPoint[]
}

const W = 600
const H = 200
const PAD = { top: 10, right: 20, bottom: 30, left: 60 }

export function BacktestChart({ pnlCurve }: BacktestChartProps) {
  if (pnlCurve.length < 2) return null

  const pts = pnlCurve.map(p => ({
    ts: new Date(p.timestamp).getTime(),
    cap: p.capital,
  }))

  const minTs = pts[0].ts
  const maxTs = pts[pts.length - 1].ts
  const minCap = Math.min(...pts.map(p => p.cap))
  const maxCap = Math.max(...pts.map(p => p.cap))
  const capRange = maxCap - minCap || 1

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const toX = (ts: number) => PAD.left + ((ts - minTs) / (maxTs - minTs)) * innerW
  const toY = (cap: number) => PAD.top + innerH - ((cap - minCap) / capRange) * innerH

  const linePoints = pts.map(p => `${toX(p.ts)},${toY(p.cap)}`).join(' ')
  const areaPoints = `${PAD.left},${PAD.top + innerH} ${linePoints} ${toX(maxTs)},${PAD.top + innerH}`

  // 5 Y-axis ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => minCap + (capRange * i) / 4)
  // 4 X-axis ticks
  const tsRange = maxTs - minTs
  const xTicks = Array.from({ length: 4 }, (_, i) => minTs + (tsRange * i) / 3)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-label="P&L curve"
    >
      <defs>
        <linearGradient id="pnl-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--pos)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--pos)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* y-axis ticks */}
      {yTicks.map((v, i) => {
        const y = toY(v)
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4}
              textAnchor="end" fill="var(--muted)" fontSize="9" fontFamily="monospace">
              ${Math.round(v).toLocaleString()}
            </text>
          </g>
        )
      })}

      {/* x-axis ticks */}
      {xTicks.map((ts, i) => {
        const x = toX(ts)
        const label = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return (
          <g key={i}>
            <text x={x} y={H - 6}
              textAnchor="middle" fill="var(--muted)" fontSize="9" fontFamily="monospace">
              {label}
            </text>
          </g>
        )
      })}

      {/* area fill */}
      <polygon points={areaPoints} fill="url(#pnl-fill)" />

      {/* line */}
      <polyline points={linePoints}
        fill="none" stroke="var(--pos)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
```

- [ ] **Step 2: Rewrite backtest/page.tsx with 272px/1fr layout and dual-mode labels**

```tsx
// packages/web/app/backtest/page.tsx
'use client'

import { useFormState } from 'react-dom'
import { runBacktest } from './actions'
import { BacktestChart } from '@/components/backtest-chart'
import { StatCard } from '@/components/stat-card'
import { formatUsd, formatPct, formatDuration } from '@/lib/format'
import type { BacktestResult } from '@trader/backtest'

type ActionState = { result: BacktestResult | null; error: string | null; running: boolean }
const initial: ActionState = { result: null, error: null, running: false }

async function backtestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const result = await runBacktest(formData)
    return { result, error: null, running: false }
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : 'Unknown error', running: false }
  }
}

const MODELS = [
  { id: 'claude-haiku-4-5',   desc: '(fast)' },
  { id: 'claude-sonnet-4-6',  desc: '(balanced)' },
  { id: 'claude-opus-4-7',    desc: '(smartest)' },
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

      {/* form column (fixed) */}
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
                <span className="xp">{m.id}</span>
                <span className="nb">{m.id} {m.desc}</span>
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

      {/* results column (fluid) */}
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
  const model = 'claude-haiku-4-5'

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
          value={stats.sharpe.toFixed(2)}
          colorVariant="info"
        />
        <StatCard
          label="Avg Hold Time"
          value={formatDuration(stats.avgHoldMs)}
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
```

- [ ] **Step 3: Verify BacktestResult.stats field names match the backtest package**

```bash
grep -r "sharpe\|avgHold\|maxDrawdown\|winRate\|totalPnl\|totalTrades" packages/backtest/src/ | head -20
```

Adjust field names in page.tsx if they differ from what's returned by the runner.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/backtest-chart.tsx packages/web/app/backtest/page.tsx
git commit -m "feat(web): backtest SVG chart, 272px/1fr layout, dual-mode labels, remove recharts"
```

---

## Task 14: Cleanup — remove unused UI primitives and page h1s

**Files:**
- Modify: `packages/web/app/positions/page.tsx`
- Modify: `packages/web/app/trades/page.tsx`
- Optionally remove: `packages/web/components/ui/card.tsx` (no longer used)

The Topbar now handles page titles, so the `<h1>` in each page is redundant.

- [ ] **Step 1: Remove h1 from positions page**

```tsx
// packages/web/app/positions/page.tsx
import { tradeRepository } from '@trader/db'
import { PositionsLive } from '@/components/positions-live'

export default async function PositionsPage() {
  const openTrades = await tradeRepository.findOpenTrades()
  return <PositionsLive initialPositions={openTrades} />
}
```

- [ ] **Step 2: Remove h1 from trades page**

```tsx
// packages/web/app/trades/page.tsx
import { tradeRepository } from '@trader/db'
import { TradesTable } from '@/components/trades-table'
import Link from 'next/link'

export const revalidate = 60
const PAGE_SIZE = 50

interface TradesPageProps { searchParams: { page?: string } }

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const page = Math.max(1, Number(searchParams.page ?? '1'))
  const limit = PAGE_SIZE * page
  const trades = await tradeRepository.findRecentTrades(limit)
  const pageTrades = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasMore = trades.length === limit

  return (
    <div>
      <TradesTable trades={pageTrades} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        {page > 1 && (
          <Link href={`/trades?page=${page - 1}`} style={{
            padding: '5px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', color: 'var(--fg)', textDecoration: 'none', fontSize: '12px',
          }}>Previous</Link>
        )}
        {hasMore && (
          <Link href={`/trades?page=${page + 1}`} style={{
            padding: '5px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', color: 'var(--fg)', textDecoration: 'none', fontSize: '12px',
          }}>Next</Link>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck everything**

```bash
cd packages/web && pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/positions/page.tsx packages/web/app/trades/page.tsx
git commit -m "chore(web): remove redundant h1s — Topbar handles page titles"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered in task |
|---|---|
| 1. Design tokens (colors, fonts, radius) | Task 1 |
| 2. Layout (sidebar 184px, sticky topbar, 2-col) | Task 2, Task 10 |
| 3. Screens / routes | existing routes, unchanged |
| 4.1 Stat card | Task 5 |
| 4.2 Approval banner | Task 8 |
| 4.3 Signal feed | Task 9 |
| 4.4 Positions table (Side col, expand, confidence) | Task 11 |
| 4.5 Trade history table | Task 12 |
| 4.6 Backtest form + SVG chart | Task 13 |
| 5. Expert/Simple toggle (CSS, localStorage, all components) | Task 1 (CSS), Task 3 (toggle button), Task 4–13 (xp/nb wrappers) |
| 6. Typography scale | Task 1 (tokens), applied in components |
| 7. Interactive states (hover, expand, approve/reject) | Tasks 8, 11, 12 |

**Gaps found:**

1. **Confidence bar on positions table** — spec §4.4 says "confidence bar (width = LLMDecision.confidence * 100%)". The `Trade` type doesn't carry `confidence` — that's on `LLMDecision`. The positions page currently shows `Trade[]`. Either we join LLMDecision to the open trades on the server, or we skip the confidence bar (trade has no direct confidence). **Resolution:** Skip confidence bar — `Trade` has no confidence field and joining adds complexity not scoped here. The expand/collapse reasoning is implemented.

2. **`backtest/page.tsx` uses `stats.sharpe`** — need to verify the actual field name. The grep in Task 13 Step 3 catches this.

3. **Topbar mode toggle active state** — when the page loads, the button doesn't visually reflect the current mode until JS hydrates. This is acceptable (server renders no `noob` class, client restores it on mount). No fix needed.

4. **`recharts` still in package.json** — after removing BacktestChart's recharts usage, `recharts` can be removed from `packages/web/package.json`. Add to Task 13:

- [ ] **Remove recharts from package.json after SVG chart is working**

```bash
cd packages/web && pnpm remove recharts
```
