# Crypto Trader — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

---

## Overview

An LLM-driven intraday crypto trading system with backtesting, extensible multi-source data ingestion, and a hybrid autonomy model. The bot trades autonomously below a size threshold and requests human approval above it. World information (news, macro, on-chain, social sentiment) is fed to the LLM alongside price data to inform decisions.

---

## Architecture

### Monorepo Structure

```
trader/
  packages/
    core/        # trading engine, order management, capital guard
    data/        # ingestion pipeline + pluggable source plugins
    llm/         # model-agnostic LLM adapter layer + decision parsing
    backtest/    # historical replay engine
    web/         # Next.js dashboard
    bot/         # Telegram integration
  shared/        # shared TypeScript types: Signal, Trade, Position, LLMDecision, WorldSnapshot, TradingContext
```

### Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript | type safety across packages, user preference |
| Package manager | pnpm workspaces | fast, excellent monorepo support |
| Exchange | ccxt | abstracts Binance API, multi-exchange ready |
| LLM (live) | Claude Sonnet 4.6 (default) | tool use, large context, prompt caching |
| LLM (backtest) | Claude Haiku 4.5 (default) | cost-efficient for ~2,880 calls per 30-day run |
| Database | PostgreSQL + Prisma | trades, signals, OHLCV history, LLM decisions |
| Web | Next.js + shadcn/ui | fast to build, good defaults |
| Telegram | grammy | lightweight, TypeScript-first |
| Scheduler | node-cron | trigger intraday evaluation cycles |

### Live Runtime Flow

1. Scheduler triggers evaluation cycle (e.g., every 15 min)
2. `data` fetches latest signals from all sources in parallel → `WorldSnapshot`
3. `llm` builds a prompt with price data + all signals, calls configured LLM adapter
4. LLM returns a structured `LLMDecision` via tool use (not free text)
5. If `size ≤ autoTradeLimit` → `core` executes automatically
6. If `size > autoTradeLimit` → `bot` sends Telegram approval request
7. `core` enforces capital cap before any order touches Binance

---

## Data Ingestion Pipeline

### Key Shared Types

```typescript
interface WorldSnapshot {
  timestamp: Date
  signals: Signal[]           // merged output of all active DataSources
  ohlcv: Record<string, Candle[]>  // coin → candles for multiple timeframes
}

interface TradingContext {
  snapshot: WorldSnapshot
  positions: Position[]
  availableCapital: number
  recentTrades: Trade[]
  openOrders: Order[]
}
```

### DataSource Interface

Every source implements a single interface. Adding a new source = one new file.

```typescript
interface DataSource {
  id: string
  fetch(): Promise<Signal[]>
  fetchHistorical(from: Date, to: Date): Promise<Signal[]>
}

interface Signal {
  source: string
  type: 'news' | 'sentiment' | 'onchain' | 'macro' | 'price'
  content: string       // human-readable, inserted into LLM prompt
  timestamp: Date
  coins?: string[]      // coins this signal relates to, if known
  raw?: unknown         // original payload for debugging and replay
}
```

### Initial Source Plugins

| Plugin | Type | Notes |
|---|---|---|
| Binance WebSocket | price | real-time OHLCV, order book |
| CryptoPanic API | news | crypto news aggregator, free tier |
| Alternative.me | sentiment | Fear & Greed index, full history available |
| Glassnode / CryptoQuant | on-chain | whale flows, exchange reserves (paid tier for history) |
| NewsAPI / GDELT | macro | Fed decisions, CPI, geopolitical headlines |
| Reddit API | social | r/CryptoCurrency, r/Bitcoin sentiment |

`NullDataSource` fallback returns empty signals when historical data is unavailable, so backtests still run without crashing.

---

## LLM Decision Engine

### Model-Agnostic Adapter Layer

The `llm` package never imports a provider SDK directly. All providers implement `LLMAdapter`:

```typescript
interface LLMAdapter {
  decide(context: TradingContext): Promise<LLMDecision>
}

class ClaudeAdapter implements LLMAdapter { ... }
class OpenAIAdapter implements LLMAdapter { ... }
// future: GeminiAdapter, LocalLlamaAdapter, etc.
```

Active adapter is selected via config at startup. Different adapters can be used per environment (e.g., OpenAI for backtesting, Claude for live) or compared across backtest runs.

### LLM Prompt Contents (each cycle)

1. Current positions and available capital
2. Recent OHLCV for top 10-20 coins (4h, 1h, 15m candles)
3. All signals from `WorldSnapshot`, sorted by recency
4. Open orders and their status
5. Recent trade history + P&L context

**Prompt caching:** Static system prompt (instructions, coin list, strategy rules) is cached via Claude's prompt caching API. Only the dynamic `WorldSnapshot` changes per cycle — keeps intraday costs low.

### LLM Output (structured via tool use)

```typescript
interface LLMDecision {
  action: 'buy' | 'sell' | 'hold'
  coin: string           // e.g. 'BTC/USDT'
  size: number           // in USDT
  confidence: number     // 0-1
  reasoning: string      // shown in UI and Telegram
  stopLoss?: number
  takeProfit?: number
}
```

### Hybrid Approval Thresholds

- `size ≤ autoTradeLimit` (configurable, e.g. $50) → auto-execute
- `size > autoTradeLimit` → Telegram approval request
- No response within N minutes (configurable) → auto-cancel

### Safety Rails (enforced in `core`, LLM cannot override)

- Hard capital cap — total exposure never exceeds allocated amount
- Max position size per coin
- Spot only — no leveraged or margin orders to start

### Capital Isolation

No Binance sub-account required. `core` tracks its own deployed capital internally and refuses to place orders that would exceed the configured allocation. Hard cap is enforced before any Binance API call.

---

## Backtesting Engine

```typescript
interface BacktestConfig {
  from: Date
  to: Date
  initialCapital: number
  autoTradeLimit: number
  coins: string[]
  sources: DataSource[]   // historical versions of the same plugins
  adapter: LLMAdapter     // swap provider per run
}
```

### How It Works

1. Load historical OHLCV + signals for the time range
2. Step through time at configured intervals (e.g., 15 min)
3. At each step, build `WorldSnapshot` from data available at that moment (strict no-lookahead)
4. Call the real `llm` package — LLM decides based on historical context
5. `core` simulates order execution against historical prices (market orders fill at next candle open)
6. Track positions, P&L, drawdown, win rate

### Output

- P&L curve over time
- Per-trade log with LLM reasoning captured
- Summary stats: Sharpe ratio, max drawdown, win rate, avg hold time
- Visible in web dashboard alongside live performance

### Cost Management

A 30-day backtest at 15-min intervals ≈ 2,880 LLM calls. Default backtest adapter is Haiku 4.5. Can configure any adapter per run.

---

## Web Dashboard (Next.js)

### Views

| View | Contents |
|---|---|
| Overview | Total P&L, capital deployed, open positions, live Fear & Greed |
| Positions | Per-coin: entry price, current price, unrealized P&L, stop/take levels, LLM reasoning |
| Trade History | Closed trades with LLM reasoning, outcome, duration |
| Backtest | Config form, P&L curve chart, stats summary, per-trade log |

Live updates via WebSocket — positions and P&L refresh without page reload.

---

## Telegram Bot (grammy)

### Push Alerts

- Trade executed automatically (with reasoning)
- Approval needed (inline approve/reject buttons)
- Stop-loss or take-profit triggered
- Capital cap approached (>80% deployed)

### Pull Commands

| Command | Action |
|---|---|
| `/status` | Current positions + P&L |
| `/pause` | Halt evaluation cycle |
| `/resume` | Resume evaluation cycle |
| `/capital` | Deployed vs. available capital |

### Approval Flow

```
Bot: "Trader wants to BUY $200 of ETH/USDT
      Confidence: 0.82
      Reason: Strong on-chain inflow + positive macro sentiment after Fed pause
      [✅ Approve] [❌ Reject]"

Approve → order executes
No response in 10 min → auto-cancel
```

---

## Target Markets

Top 10-20 coins by market cap on Binance (spot only). Intraday frequency, evaluation cycle every 15 minutes by default (configurable).

---

## Key Constraints & Open Questions

- Historical news/sentiment coverage varies by source — `NullDataSource` fallback ensures backtest always runs
- Binance API rate limits must be respected in the data layer (ccxt handles most of this)
- LLM costs for live intraday trading at 15-min cycles should be monitored; prompt caching mitigates this
- Glassnode/CryptoQuant require paid tiers for historical on-chain data
