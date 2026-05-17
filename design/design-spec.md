# Trader Dashboard — Design Spec

**Visual reference:** `.od/projects/0e308369-cfa6-4d35-9cab-304161b5acac/trader-dashboard-v2-2.html`
Open that file in a browser to see the live prototype. All tokens, copy, and interactions below match it exactly.

---

## 1. Design tokens

Map these directly to your Tailwind config or CSS custom-property layer.

```ts
// tokens.ts
export const tokens = {
  color: {
    bg:      '#09090f',   // page background
    surface: '#111118',   // card / sidebar / topbar background
    sf2:     '#18181f',   // hover state, secondary surface, input backgrounds
    border:  '#1e1e2c',   // all borders, dividers
    fg:      '#ddddf0',   // primary text
    muted:   '#50506a',   // secondary text, labels, placeholders
    accent:  '#00e5a0',   // brand accent — used at most twice per screen
    pos:     '#10c97a',   // positive P&L, BUY side, on-chain bullish signals
    neg:     '#f05050',   // negative P&L, SELL short side, bearish signals
    warn:    '#e8a020',   // pending approval, Fear & Greed mid-range
    info:    '#6090f0',   // macro signals, Sharpe ratio, neutral informational
  },
  font: {
    display: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif`,
    body:    `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`,
    mono:    `'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace`,
  },
  radius: {
    sm: '3px',   // pills, tags
    md: '5px',   // cards, inputs, buttons (--r)
    lg: '10px',  // tweaks panel
  },
  layout: {
    sidebarWidth: '184px',
    baseFontSize: '12px',
    baseLineHeight: '1.5',
  },
} as const;
```

**Color usage rules:**
- `accent` — brand green; use only for the primary CTA button and the live pulse dot. Never use as a background fill for large areas.
- `pos` / `neg` — strictly for financial direction (P&L, BUY/SELL badges, signal dots). Not for generic success/error states.
- `warn` — reserved for the approval banner and Fear & Greed when the index is 30–60. Use `neg` when index < 30.
- Numeric values everywhere: `font-variant-numeric: tabular-nums`.
- Monospace font for all numbers, codes, API labels, timestamps, form field labels in expert mode.

---

## 2. Layout

```
┌──────────────────────────────────────────────────────┐
│  Sidebar (184px fixed)  │  Topbar (sticky, full-width)│
│                         ├──────────────────────────────│
│  Brand logo             │  Page title    Mode toggle   │
│  Nav items              │                Cycle clock   │
│                         │                Live pill     │
│  Status badge (bottom)  ├──────────────────────────────│
│                         │  .content (padding 18px 20px)│
│                         │  — Approval banner (if any)  │
│                         │  — Stat grid (4 cols)        │
│                         │  — Two-col layout (1.6 : 1)  │
└──────────────────────────────────────────────────────┘
```

- Main content has `margin-left: 184px`.
- Topbar is `position: sticky; top: 0` so it stays visible on scroll.
- `.two-col` grid: `grid-template-columns: 1.6fr 1fr` — left panel for tables, right for feeds/forms.
- Backtest screen uses `272px 1fr` (form column fixed, results fluid).

---

## 3. Screens / pages

| Route suggestion | Screen id | Nav label (Expert / Simple) |
|---|---|---|
| `/` | `overview` | Overview / Home |
| `/positions` | `positions` | Open Positions / Active Trades |
| `/trades` | `trades` | Trade History |
| `/backtest` | `backtest` | Backtest / Test the AI |

In the prototype these are toggled by adding/removing `.active` on `.screen` divs. In Next.js, use the router.

---

## 4. Components

### 4.1 Stat card

```
┌──────────────────────┐
│ LABEL (mono, 10px)   │
│ $1,842.50  (22px)    │  ← color: pos / neg / warn / fg
│ +12% since inception │  ← color: matches value color
└──────────────────────┘
```

Four cards in a 4-column grid on Overview. Props: `label`, `value`, `sub`, `colorVariant: 'pos' | 'neg' | 'warn' | 'info' | 'neutral'`.

The four stat cards on Overview map to these data sources:
- **Total P&L** — sum of `Trade.pnl` for all closed trades
- **Capital Deployed** — sum of `Trade.size` for all open trades
- **Open Positions** — count of open `Trade` records
- **Fear & Greed** — `WorldSnapshot.fearGreedIndex` (0–100)

### 4.2 Approval banner

Shown when a `LLMDecision` has `status: 'pending'`. Data fields:

```ts
interface LLMDecision {
  action:      'buy' | 'sell' | 'hold';
  coin:        string;          // e.g. 'ETH/USDT'
  size:        number;          // dollars
  confidence:  number;          // 0–1
  stopLoss:    number;          // price
  takeProfit:  number;          // price
  reasoning:   string;          // full LLM text
  createdAt:   Date;
  expiresAt:   Date;            // auto-cancel deadline
}
```

The banner has two content layers (see Expert/Simple section below). Approve/Reject buttons call the Telegram-flow endpoint or directly update the decision status.

The countdown timer (`expiresAt - now`) is computed client-side and updates every second.

### 4.3 Signal feed

Each item maps to `Signal` from `WorldSnapshot.signals`:

```ts
interface Signal {
  type:   'news' | 'sentiment' | 'onchain' | 'macro' | 'price';
  source: string;    // e.g. 'GLASSNODE', 'CRYPTOPANIC'
  coins:  string[];  // affected coins, empty = all
  text:   string;    // human-readable description
  score?: number;    // optional sentiment score (-1 to +1)
  ts:     Date;
}
```

Dot color mapping:
- `news` → `--neg` (red)
- `sentiment` → `--warn` (amber)
- `onchain` → `--pos` (green)
- `macro` → `--info` (blue)
- `price` → `--muted` (grey)

### 4.4 Positions table

Columns: Coin | Side | Entry Price | Size | Reasoning

Data source: `Trade[]` where `closedAt` is null. No stop/take-profit columns here — those fields live only on `LLMDecision`, not on the `Trade` row itself.

Reasoning cell: collapsed to 2 lines by default, click to expand. Accompanied by a confidence bar (width = `LLMDecision.confidence * 100%`).

### 4.5 Trade history table

Columns: Coin | Side | Entry | Exit | P&L | Duration | Reasoning

- **Entry** = `Trade.entryPrice`
- **Exit** = `Trade.exitPrice` (null for open trades — not shown here)
- **P&L** = `Trade.pnl`
- **Duration** = `formatDuration(Trade.closedAt - Trade.openedAt)` — format as `4h 22m`
- **Reasoning** = from the linked `LLMDecision.reasoning`

### 4.6 Backtest form + results

Form fields map to `BacktestConfig`:

```ts
interface BacktestConfig {
  fromDate:       string;  // ISO date
  toDate:         string;  // ISO date
  initialCapital: number;
  coins:          string;  // comma-separated, e.g. 'BTC/USDT,ETH/USDT'
  model:          string;  // e.g. 'claude-haiku-4-5'
}
```

Results map to `BacktestResult`:

```ts
interface BacktestResult {
  stats: {
    totalPnl:    number;
    winRate:     number;  // 0–1
    totalTrades: number;
    maxDrawdown: number;  // negative
    sharpe:      number;
    avgHoldMs:   number;  // format as '2h 00m'
  };
  pnlCurve: Array<{ timestamp: Date; capital: number }>;
}
```

The P&L chart is an inline SVG polyline (no charting library dependency). X-axis = date ticks, Y-axis = capital in dollars. Green fill gradient below the line.

---

## 5. Expert / Simple toggle

### How it works (front-end)

A body-level class `noob` switches between two layers of content. The pattern is pure CSS — no JS conditional rendering:

```css
.nb { display: none; }           /* Simple content hidden by default */
body.noob .xp { display: none; } /* Expert content hidden when noob active */
body.noob .nb { display: revert; }
```

Every piece of text that differs between modes is wrapped in a pair of sibling spans:

```html
<span class="xp">Entry Price</span>
<span class="nb">Bought At</span>
```

This pattern is used on: nav labels, stat card labels, stat card subs, approval banner meta fields, table column headers, reasoning text, signal source labels, backtest form labels, backtest result labels, countdown text.

**Toggle button** lives in the topbar:

```html
<div class="mode-toggle">
  <button data-mode="expert" onclick="setMode('expert')">Expert</button>
  <button data-mode="noob"   onclick="setMode('noob')">Simple</button>
</div>
```

Active state is driven by CSS:
```css
body:not(.noob) .mode-btn[data-mode="expert"] { background: var(--surface); color: var(--fg); }
body.noob       .mode-btn[data-mode="noob"]   { background: color-mix(…); color: var(--accent); }
```

Mode is persisted to `localStorage` as `traderMode: 'expert' | 'noob'` and restored on load.

### What changes in Simple mode

| Element | Expert | Simple |
|---|---|---|
| Stat: Capital Deployed label | "Capital Deployed" | "Money in the Market" |
| Stat: Capital Deployed sub | "sum of open Trade.size" | "currently tied up in trades" |
| Stat: Fear & Greed label | "Fear & Greed" | "Market Mood Score" |
| Stat: Fear & Greed sub | "Neutral · ↑ from 38" | "Neutral (50 = calm) · improving" |
| Approval banner tag | "APPROVAL NEEDED" (monospace, uppercase) | "Your decision needed" |
| Approval banner title | "BUY $200 ETH/USDT — confidence 0.84" | "Buy $200 of Ethereum — AI is 84% confident" |
| Approval banner meta | technical fields (action, stopLoss, takeProfit) | plain fields (What, Exit if drops to, Max profit/loss) |
| Approval banner reasoning | raw LLM output | plain English rewrite |
| Signal source labels | "GLASSNODE · onchain · [btc]" | "Blockchain activity · Bitcoin" |
| Signal hints | not shown | italic annotation on technical signals |
| Table header: Side | "Side" | "Direction" |
| Table header: Entry | "Entry Price" | "Bought At" |
| Table header: P&L | "P&L" | "Profit / Loss" |
| Reasoning text | LLM text verbatim | plain English rewrite |
| Confidence bar | "0.79" | "79% sure" |
| Backtest form labels | "Initial Capital ($)", "LLM Model" | "Starting money ($)", "AI brain to use" |
| Backtest model options | bare model IDs | IDs with descriptors ("(fast)", "(balanced)", "(smartest)") |
| Backtest results label | "BacktestResult.stats" | hidden |
| Backtest stats labels | "Total P&L", "Win Rate", "Max Drawdown", "Sharpe Ratio" | "Total Profit", "Trades that won", "Worst losing stretch", "Risk vs Reward score" |
| Chart title | "BacktestResult.pnlCurve · PnlPoint[]…" | "How your $1,000 would have grown over time" |
| Running state text | "Running backtest — calling claude-haiku-4-5…" | "Replaying history… the AI is making decisions on old data…" |
| Sidebar: cycle status | "Live · 15m cycle" | "Live · checks every 15 min" |
| `.card-meta` | shown (API method names) | hidden via CSS |
| `.results-label` | shown | hidden via CSS |
| Monospace labels | mono font, uppercase, tracked | body font, sentence case, normal tracking |

### Backend implications

The toggle is **presentation-only** in the prototype — the same API data powers both modes, and all translation happens at the component level. However, there are two places where the back-end could optionally support it:

1. **`LLMDecision.reasoning`** — the prototype currently rewrites the raw LLM text manually. In production you can either:
   - Store a single `reasoning` field (raw LLM output) and translate in the front-end component, **or**
   - Have the LLM generate two outputs: `reasoning` (technical) and `reasoningSimple` (plain English). The system prompt would request both. This keeps the front-end thin and lets the AI handle the translation itself.

2. **Notification text (Telegram)** — the approval flow sends a Telegram message. If you want Simple mode to also affect Telegram notifications (for non-technical users who monitor on mobile), the `LLMDecision` creation step should accept a `userMode: 'expert' | 'noob'` parameter and render the Telegram message accordingly. Store it as `telegramText` on the decision record.

Recommended default: store only `reasoning` (raw), translate in the UI. Only add `reasoningSimple` if Telegram notifications need it too.

---

## 6. Typography scale

| Use | Size | Font | Weight | Color |
|---|---|---|---|---|
| Brand name | 14px | display | 600 | fg |
| Page title | 14px | display | 600 | fg |
| Section / card title | 12px | body | 600 | fg |
| Nav item | 12px | body | 400 | muted → fg on hover |
| Table header | 9.5px | mono | 500 | muted, uppercase |
| Table cell | 12px | body | 400 | fg |
| Numeric / mono cell | 12px | mono | 400 | fg |
| Stat value | 20px | mono | 600 | varies |
| Stat label | 10px | mono | 400 | muted, uppercase |
| Stat sub | 10px | mono | 400 | matches value color |
| Pill / badge | 10.5px | mono | 500 | varies |
| Banner reasoning | 11.5px | body | 400 | muted |
| Signal text | 11px | body | 400 | fg |
| Signal source | 9.5px | mono | 400 | muted |
| Reasoning cell | 11px | body | 400 | muted |
| Countdown | 10px | mono | 400 | muted |

---

## 7. Interactive states

- **Row hover** — `background: var(--sf2)` on all `td` in the row. No border change.
- **Reasoning expand** — click any `.rt` element to toggle `.expanded`. Collapsed = `-webkit-line-clamp: 2`. Expanded = no clamp. Arrow suffix changes `↓` → `↑`.
- **Nav active** — `.active` class: `background: color-mix(in oklch, var(--accent) 10%, transparent); color: var(--accent)`.
- **Card hover** (stat cards) — `border-color: color-mix(in oklch, var(--accent) 40%, var(--border))`.
- **Approve / Reject** — removes the banner element from the DOM. In production: call `PATCH /api/decisions/:id` with `{ status: 'approved' | 'rejected' }`.
- **Backtest run** — shows spinner + status text for ~2s, then replaces with results. The SVG chart is drawn after results are injected.

---

## 8. File paths

| File | Purpose |
|---|---|
| `trader-dashboard-v2-2.html` | **Canonical final prototype** — use this as the visual reference |
| `trader-dashboard-v2.html` | Previous iteration (Expert/Simple toggle, same data model) |
| `trader-dashboard-prototype.html` | Initial exploration (3-theme Tweaks panel, no Expert/Simple) |
| `design-spec.md` | This document |

All files live at:
```
/Users/thanasisgliatis/git/open-design/.od/projects/0e308369-cfa6-4d35-9cab-304161b5acac/
```
