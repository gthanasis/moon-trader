# Implementation Plan: Live Bot Improvements

## Overview

Fix correctness bugs that lose real money, then layer in strategy improvements visible in backtests.
All changes live in shared code (`core`, `llm`) so backtests automatically reflect live behaviour.
Tasks are ordered: correctness first, strategy second.

## Architecture Decisions

- **Live and backtest share `EvaluationCycle`** — any guard added there applies to both paths automatically.
- **`TradingEngine` tracks realised P&L** instead of treating capital as fixed. `SimulatedEngine` already does this; live must match.
- **Risk-based sizing lives in `EvaluationCycle`** — the engine stays a dumb executor; sizing logic is above it, shared.
- **Take-profit / trailing stop mirrors stop-loss** — same `checkStopLosses()` call, same `EngineLike` interface, same backtest coverage.

---

## Phase 1 — Correctness (prevents money loss)

### Task 1: Fix capital tracking — `CapitalGuard` must account for realised P&L

**Description:**
`CapitalGuard` tracks `total - deployed` where `total` is the initial config value. After a losing trade
`release(size)` restores the original notional even though the proceeds were less. Over time, `availableCapital()`
is higher than actual cash. This task makes the guard track realised P&L so available capital shrinks
after losses and grows after wins.

Also fix paper-mode fill price: paper buys currently store `fillPrice = undefined` (no price is passed to
`orders.place()` for buys), which means the downstream P&L calculation is NaN. Pass the current market
price (last candle close, already available in `EvaluationCycle`) when placing paper buy orders.

**Changes:**
- `packages/core/src/capital-guard.ts` — add `releaseWithProceeds(reserved, proceeds)` that records the delta
  as `realisedPnl`. `availableCapital()` returns `total + realisedPnl - deployed`.
- `packages/core/src/trading-engine.ts` — sell path calls `guard.releaseWithProceeds(pos.size, proceeds)`
  where `proceeds = (pos.size / pos.entryPrice) * fillPrice`. Also: accept a `marketPrice` param in the
  buy path and pass it to `orders.place()` so paper fills get a real fill price.
- `packages/llm/src/evaluation-cycle.ts` — pass `lastCandle.close` as the market price when building the
  buy decision so `TradingEngine` can forward it to `OrderManager`.

**Acceptance criteria:**
- [ ] After a losing sell, `engine.availableCapital()` is lower than initial capital
- [ ] After a winning sell, `engine.availableCapital()` reflects the gain
- [ ] Paper buy fill price = current market price (last candle close), not `undefined`
- [ ] Existing `capital-guard` tests updated; new test for P&L-tracking path

**Verification:**
- [ ] `cd packages/core && npx vitest run`
- [ ] `cd packages/llm && npx vitest run`
- [ ] `cd packages/backtest && npx vitest run`

**Dependencies:** None

**Files:**
- `packages/core/src/capital-guard.ts`
- `packages/core/src/trading-engine.ts`
- `packages/llm/src/evaluation-cycle.ts`
- `packages/core/tests/capital-guard.test.ts`
- `packages/core/tests/trading-engine.test.ts`

**Estimated scope:** M

---

### Task 2: Reject duplicate positions per coin

**Description:**
`PositionTracker` is keyed by coin (`Map<string, Position>`). A second buy on the same coin overwrites
the first silently — the old position data (entryPrice, stopLoss, size) is lost, but `CapitalGuard` has
reserved twice. This creates phantom deployed capital that is never released on a single sell.

Fix: `TradingEngine.execute()` returns `{ executed: false, reason: 'position already open for BTC/USDT' }`
when `this.positions.get(decision.coin)` is defined. The LLM prompt already shows open positions; this
guard makes "no double-entry" a hard engine constraint rather than a prompt suggestion.

**Acceptance criteria:**
- [ ] `engine.execute(buy BTC)` when BTC position is open returns `{ executed: false }`
- [ ] Capital is unchanged after the rejected buy
- [ ] A sell closes the existing position normally

**Verification:**
- [ ] `cd packages/core && npx vitest run`
- [ ] `cd packages/backtest && npx vitest run` (backtest already supports LIFO multiple positions — confirm it still passes)

**Dependencies:** None (independent of Task 1)

**Files:**
- `packages/core/src/trading-engine.ts`
- `packages/core/tests/trading-engine.test.ts`

**Estimated scope:** S

---

### Task 3: Validate fill price before opening position

**Description:**
`TradingEngine.execute()` buy path calls `positions.open({ entryPrice: order.fillPrice ?? 0 })`. A `fillPrice`
of 0 creates infinite P&L on the position's `unrealizedPnl()` and corrupts stop-loss checks. This happens
today for paper buys (since `fillPrice` is `undefined`) and can happen live if Binance returns a bad fill.

Fix: after Task 1 corrects paper fill prices, add a guard: if `order.status === 'filled'` but
`!order.fillPrice || order.fillPrice <= 0`, log an error and return `{ executed: false, reason: 'invalid fill price' }`.
Do not open the position. Do not update the guard.

**Acceptance criteria:**
- [ ] A buy with `fillPrice = 0` or `undefined` does not open a position
- [ ] Capital is unchanged when the guard fires
- [ ] A buy with a valid fill price proceeds normally

**Verification:**
- [ ] `cd packages/core && npx vitest run`

**Dependencies:** Task 1 (fixes paper fill price so this guard doesn't fire spuriously in paper mode)

**Files:**
- `packages/core/src/trading-engine.ts`
- `packages/core/tests/trading-engine.test.ts`

**Estimated scope:** S

---

### Task 4: Enforce take-profit (and add backtest coverage)

**Description:**
`LLMDecision.takeProfit` and `Position.takeProfit` exist but are never checked. Both `TradingEngine.checkStopLosses()`
and `SimulatedEngine.checkStopLosses()` need to close positions when `currentPrice >= takeProfit`.

In backtest, use candle `high` vs `takeProfit` (mirrors how stop-loss uses `low`), and fill at
`min(high, takeProfit)` — conservative. In live, `currentPrice` (last close) vs `takeProfit`.

**Acceptance criteria:**
- [ ] Live: position closes when `currentPrice >= takeProfit` in `checkStopLosses()`
- [ ] Backtest: position closes when candle `high >= takeProfit`; fill at `takeProfit` price
- [ ] Backtest `pnl` for a take-profit close is positive and correct
- [ ] Take-profit close appears in stats (counted as win)

**Verification:**
- [ ] `cd packages/core && npx vitest run`
- [ ] `cd packages/backtest && npx vitest run`
- [ ] New test: buy at 100 with takeProfit=110; next candle high=115; position closes at 110

**Dependencies:** None (Task 1 desirable but not blocking)

**Files:**
- `packages/core/src/trading-engine.ts`
- `packages/backtest/src/backtest-runner.ts`
- `packages/core/tests/trading-engine.test.ts`
- `packages/backtest/tests/backtest-runner.test.ts`

**Estimated scope:** M

---

## Checkpoint — After Phase 1

- [ ] All test suites pass: `core`, `llm`, `backtest`
- [ ] Run a short backtest (1 week, BTC) and confirm: capital curve is monotone-correct (no phantom capital), take-profits close trades, stops fire on wicks
- [ ] Review with human before Phase 2

---

## Phase 2 — Strategy (improves P&L, visible in backtest)

### Task 5: Risk-based position sizing

**Description:**
The LLM picks an arbitrary USDT size. There is no relationship between size, volatility, and the stop-loss
distance. Volatile markets with wide stops can risk 30% of capital; calm markets with tight stops risk 0.5%.

Fix in `EvaluationCycle.run()`, just before `engine.execute()`:

```
if decision.action === 'buy' && decision.stopLoss:
  stopDistance = (entryPrice - stopLoss) / entryPrice
  if stopDistance < 0.003 or stopDistance > 0.15: reject
  riskDollars = availableCapital * riskPerTradePct   // default 0.01 (1%)
  decision.size = riskDollars / stopDistance
  decision.size = min(decision.size, autoTradeLimit)
```

`riskPerTradePct` defaults to 1% and is configurable. Add it to `EvaluationCycleConfig`.
If no `stopLoss` on the decision, keep LLM size but cap at `autoTradeLimit`.

**Acceptance criteria:**
- [ ] A buy with stopLoss 2% below entry sizes to `capital * 0.01 / 0.02 = 0.5% of capital`
- [ ] A buy with stopLoss 0.2% below entry is rejected (too tight, implied leverage too high)
- [ ] A buy with stopLoss 20% below entry is rejected (sloppy stop)
- [ ] A buy with no stopLoss passes through at LLM size, capped at autoTradeLimit
- [ ] Both live runner and backtest use this path (they both go through `EvaluationCycle`)

**Verification:**
- [ ] `cd packages/llm && npx vitest run`
- [ ] `cd packages/backtest && npx vitest run`
- [ ] Backtest output: trade sizes vary with volatility, not fixed

**Dependencies:** None (isolated to `EvaluationCycle`)

**Files:**
- `packages/llm/src/evaluation-cycle.ts`
- `packages/llm/tests/evaluation-cycle.test.ts`

**Estimated scope:** M

---

### Task 6: Enforce confidence threshold in EvaluationCycle

**Description:**
The system prompt says "only buy when confidence > 0.6" but nothing enforces it. A nervous LLM returning
`confidence: 0.55` still trades. Add a hard guard in `EvaluationCycle.run()`.

Add `minConfidence?: number` to `EvaluationCycleConfig` (default `0.6`). After `adapter.decide()`, if
`decision.action !== 'hold' && decision.confidence < minConfidence`, return
`{ decision, executed: false, reason: 'confidence below threshold' }`.

**Acceptance criteria:**
- [ ] Decision with `confidence: 0.55` on a non-hold action returns `executed: false`
- [ ] Decision with `confidence: 0.6` (at threshold) executes normally
- [ ] Hold decisions are not gated by confidence

**Verification:**
- [ ] `cd packages/llm && npx vitest run`

**Dependencies:** None

**Files:**
- `packages/llm/src/evaluation-cycle.ts`
- `packages/llm/tests/evaluation-cycle.test.ts`

**Estimated scope:** S

---

### Task 7: Richer indicators in the prompt

**Description:**
The prompt gives raw OHLCV rows. LLMs are poor at deriving trend/momentum from token-space arithmetic.
Extend the indicators already added (RSI, EMA20/50, volRatio) with:

- **ATR(14)** — average true range over 14 bars; tells the model how wide stops should be
- **Realised vol** — 20-period close-to-close σ, annualised; regime signal
- **EMA distance** — `(price - EMA20) / EMA20 * 100`% and `(price - EMA50) / EMA50 * 100`%
- **Volume z-score** — `(lastVol - mean20Vol) / std20Vol`; spikes signal breakouts
- **BTC macro line** — when coin ≠ BTC, add a one-line "BTC 24h return: +2.3%" using the BTC candle in the same snapshot

All computed in `prompt-builder.ts`. Backtest gets identical indicators since it uses the same builder.

**Acceptance criteria:**
- [ ] Prompt for BTC includes ATR, realised vol, EMA distances, vol z-score
- [ ] Prompt for ETH (or any alt) includes BTC 24h return as a macro line
- [ ] Computation handles fewer than `period` candles gracefully (returns `'n/a'`)
- [ ] No breaking changes to prompt structure (signals, trades, positions still present)

**Verification:**
- [ ] `cd packages/llm && npx vitest run`
- [ ] Manual: `console.log` the built prompt for a backtest cycle and inspect

**Dependencies:** None

**Files:**
- `packages/llm/src/prompt-builder.ts`
- `packages/llm/tests/prompt-builder.test.ts`

**Estimated scope:** M

---

### Task 8: Max concurrent positions guard in TradingEngine

**Description:**
Nothing prevents the LLM from opening 10 positions simultaneously. Add `maxConcurrentPositions` to
`TradingEngine` config (default `3`). Reject buys when `positions.getAll().length >= max`.

Also add a basic **daily loss circuit breaker**: if closed-trade P&L for the current UTC day drops below
`-dailyLossLimitPct * totalCapital`, all buy decisions return `executed: false` until next UTC midnight.
Track this as `dailyLossAccumulator` reset at midnight by checking the UTC date on each cycle.

**Acceptance criteria:**
- [ ] 4th concurrent buy is rejected when `maxConcurrentPositions = 3`
- [ ] After a day where losses exceed `dailyLossLimitPct`, buys are blocked
- [ ] The circuit breaker resets at UTC midnight
- [ ] Sells and holds are never blocked

**Verification:**
- [ ] `cd packages/core && npx vitest run`
- [ ] `cd packages/backtest && npx vitest run`

**Dependencies:** Task 1 (accurate P&L needed for daily loss calc)

**Files:**
- `packages/core/src/trading-engine.ts`
- `packages/core/tests/trading-engine.test.ts`

**Estimated scope:** M

---

### Task 9: Apply fees and slippage in paper mode

**Description:**
Paper mode fills at the exact quoted price with zero fees. Live fills include ~10 bps fee and a few bps
of slippage. Paper P&L is therefore systematically optimistic. Apply the same `feeRate` and `slippageBps`
defaults used in backtest to paper fills in `OrderManager`.

Add `feeRate?: number` and `slippageBps?: number` to `OrderManagerConfig`. In the paper path:
- Buy fill price = `price * (1 + slippageBps/10000)`, deduct `size * feeRate` from proceeds.
- Sell fill price = `price * (1 - slippageBps/10000)`, deduct `proceeds * feeRate`.

Wire through `TradingEngine` config → `OrderManager` config. Expose in `LiveConfig` and `BacktestConfig`
with the same defaults (`feeRate: 0.001`, `slippageBps: 5`).

**Acceptance criteria:**
- [ ] Paper buy fill price is 5 bps above the input price
- [ ] Paper sell proceeds are reduced by fees
- [ ] Live mode is unaffected (exchange fills are real)
- [ ] Backtest defaults unchanged

**Verification:**
- [ ] `cd packages/core && npx vitest run`

**Dependencies:** Task 1 (paper fill price already set; this extends it)

**Files:**
- `packages/core/src/order-manager.ts`
- `packages/core/src/trading-engine.ts`
- `packages/runner/src/config.ts`
- `packages/core/tests/order-manager.test.ts`

**Estimated scope:** S

---

## Checkpoint — After Phase 2

- [ ] All test suites pass
- [ ] Run a 30-day BTC backtest and compare P&L curve before/after Phase 1+2
- [ ] Confirm: trade sizes are smaller and more consistent, take-profits fire, daily loss limit triggered on bad days
- [ ] Review stats: Sharpe, Calmar, profit factor, win rate relative to baseline
- [ ] Human sign-off before going live with Phase 2 changes

---

## Risk and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Capital tracking change breaks existing paper trade expectations | Med | Update `trading-engine.test.ts` to use realistic fill prices; add regression test for P&L loop |
| Risk-based sizing rejects all LLM decisions (bad stop distances) | High | Log rejections prominently; start with wide bounds (0.2%–20%) then tighten |
| ATR/vol indicators add latency to prompt building | Low | All O(n) with n ≤ 200 candles; negligible |
| Daily loss circuit breaker blocks recovery after a bad morning | Med | Default limit 5%; make configurable; alert when triggered |

## Decisions

- **Trailing stops**: included in Task 4 alongside take-profit. Store `highWaterMark` on `Position`; each cycle ratchet `stopLoss` up to `max(stopLoss, highWaterMark * (1 - trailPct))`.
- **Risk per trade**: `riskPerTradePct` exposed as a config input in `LiveConfig` and `EvaluationCycleConfig`. Default `0.01` (1%).
- **Max concurrent positions**: `5`.
- **Daily loss limit**: `5%` of account.
- **Task 8 default update**: `maxConcurrentPositions = 5`, `dailyLossLimitPct = 0.05`.
- **Thesis field**: deferred — not in this plan.
