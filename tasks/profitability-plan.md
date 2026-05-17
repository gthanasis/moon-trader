# Implementation Plan: Trading-Bot Profitability Improvements

## Overview

The bot evaluates the market every ~15 min and almost always picks `hold` (≈650
holds vs. 11 executed trades, all in one 7-hour burst, net −$2.62). The current
loop has three structural defects: (a) the narration "reflection" loop rewards
inaction instead of criticising it, (b) nothing attributes trade outcomes to the
conditions that caused them, and (c) the LLM eyeballs raw candles with no
deterministic feature layer and no microstructure data. This plan implements six
fixes — referenced by their original numbering: **1** adversarial post-mortem
narration + lessons ledger, **2** alpha scoring vs. buy-and-hold BTC, **4**
win/loss math fix (partial take-profit + trailing exits), **5** microstructure
data sources + deterministic feature computation, **6** regime classification,
**7** LLM confidence calibration.

## Architecture Decisions

- **Deterministic features come first (5).** Items 6 (regime) and 7
  (calibration) both need a typed `FeatureSet` snapshot at decision time. The
  indicator math currently lives inside `prompt-builder.computeIndicators()` as
  a string; we extract it into a pure, typed module and persist a feature
  snapshot alongside each `LlmDecision` so later analysis is grounded.
- **Microstructure sources are additive `DataSource`s.** Funding rate, open
  interest, liquidations and order-book imbalance slot into the existing
  `Pipeline.sources` array and emit `Signal`s with a new `microstructure`
  `SignalType`. No existing source changes.
- **Regime is deterministic, not LLM-guessed.** A pure classifier maps a
  `FeatureSet` to a `Regime` enum. The LLM consumes the regime as an input and
  gets regime-specific strategy guidance; it does not invent the regime. The
  regime is persisted on the decision for calibration/critique.
- **The critic replaces the narrator's "is the bot sensible?" prompt.** Same
  scheduler/hierarchy, new prompt + new structured output. The critic emits
  `Lesson` proposals (a new table); lessons accumulate evidence counts and are
  pruned when contradicted, then fed back into the trading prompt.
- **Alpha is computed from the `Candle` table.** Buy-and-hold BTC return over a
  narration window is a deterministic lookup; `NarrationStats` gains
  `benchmarkReturn` and `alpha` (the `stats` column is JSON — no migration).
- **New prompt inputs are opt-in placeholders.** `{features}`,
  `{microstructure}`, `{regime}`, `{lessons}`, `{calibration}` are added to
  `PROMPT_PLACEHOLDERS` and `prompt-builder`; the default template wires them in
  but users can trim them, consistent with the existing design.
- **Engine changes (4) are isolated to `core/`.** Partial take-profit requires
  `PositionTracker` to support size reduction and `TradingEngine` to track exit
  tiers — self-contained, behind the existing `applySettings` plumbing.

## Dependency Graph

```
Phase 0 — Mechanical bug fixes        [independent — do first]

Phase 1 — Features + Microstructure (5)
   FeatureSet ──────────────┬──────────────► Phase 2 — Regime (6)
   microstructure sources ──┘                      │
                                                   │
Phase 3 — Partial TP / trailing exits (4)   [independent]
                                                   │
Phase 4 — Alpha benchmark (2) ──► Phase 5 — Critic + lessons ledger (1)
                                                   │
Phase 6 — Confidence calibration (7) ──────────────┘
   (Phases 2, 5, 6 each add one trading-prompt placeholder)
```

Build order is bottom-up: features unlock regime; the benchmark unlocks the
critic; engine and calibration are independent and slotted to fail fast on the
riskiest change (the engine).

## Task List

### Phase 0: Mechanical Bug Fixes (found in the trade data)

#### Task 0: Fix the three signal-dropping bugs

**Description:** The trade data shows three mechanical defects that silently
discard tradeable signals every cycle: (a) market buys blocked by `no fill
price available` — `OrderManager.place` returns `status:'open'` when no price
is passed, and `TradingEngine.execute` passes
`currentPrices.get(coin)` which is `undefined` for any coin the cycle has not
price-stamped; fall back to the latest candle close. (b) `EvaluationCycle`
hard-rejects a buy whose stop is tighter than 0.3% instead of repairing it —
clamp the stop to the minimum (and the 15% maximum) and proceed. (c) The engine
rejects any buy when a position is already open for that coin, wasting the
signal — allow a bounded scale-in up to the max single-position size.

**Acceptance criteria:**
- [ ] A buy on a coin without a stamped price fills against the latest candle
  close instead of returning `no fill price available`.
- [ ] A too-tight / too-loose stop is clamped into the [0.3%, 15%] band and the
  buy proceeds; only a missing stop is still rejected.
- [ ] A buy into an existing position scales in up to the max single-position
  size (or is rejected with a clear reason if already at the cap).

**Verification:**
- [ ] Tests pass: `pnpm test -- trading-engine evaluation-cycle order-manager`
- [ ] Build succeeds: `pnpm --filter api build`
- [ ] Manual: replay a cycle that previously hit each of the three blocks.

**Dependencies:** None
**Files likely touched:** `packages/api/src/core/trading-engine.ts`,
`packages/api/src/core/order-manager.ts`,
`packages/api/src/llm/evaluation-cycle.ts`,
`packages/api/tests/core/trading-engine.test.ts`,
`packages/api/tests/llm/evaluation-cycle.test.ts`
**Estimated scope:** Medium

> Note: Task 0's scale-in interacts with Task 7's partial-exit accounting. Do
> Task 0 first; Task 7 must then handle a position whose `size`/`baseQty` grew
> via scale-in.

### Phase 1: Deterministic Features + Microstructure Data (Item 5)

#### Task 1: Extract a typed `FeatureSet` and persist a decision-time snapshot

**Description:** Move the indicator math out of `prompt-builder` into a pure
`llm/features.ts` module exposing `computeFeatures(candles): FeatureSet` (RSI,
ATR, EMA20/50 distance, realised vol, volume z-score, trend, 24h return).
`prompt-builder` renders the `FeatureSet` via a new `{features}` placeholder.
Persist the per-coin `FeatureSet` of the traded coin onto each `LlmDecision` so
regime/calibration analysis is grounded in what the bot actually saw.

**Acceptance criteria:**
- [ ] `computeFeatures` is pure, fully unit-tested, and produces the same
  numbers the old `computeIndicators` string contained.
- [ ] `LlmDecision` rows store a `features` JSON snapshot (nullable; migration
  added).
- [ ] `{features}` placeholder renders a structured per-coin block; the default
  template includes it.

**Verification:**
- [ ] Tests pass: `pnpm test -- features`
- [ ] Build succeeds: `pnpm --filter api build`
- [ ] Manual: run one cycle, confirm a decision row has a populated `features`.

**Dependencies:** None
**Files likely touched:** `packages/api/src/llm/features.ts`,
`packages/api/src/llm/prompt-builder.ts`,
`packages/api/src/common/types/decision.ts`,
`packages/api/prisma/schema.prisma`,
`packages/api/src/prisma/repositories/decision.repository.ts`,
`packages/api/tests/llm/features.test.ts`
**Estimated scope:** Medium

#### Task 2: Funding-rate + open-interest data source

**Description:** Add `BinanceFuturesSource` implementing `DataSource`, fetching
funding rate and open interest from the Binance USD-M futures REST API for the
traded coins. Emit `Signal`s typed `microstructure`. Add `'microstructure'` to
`SignalType`.

**Acceptance criteria:**
- [ ] Source returns one funding + one OI signal per coin, with graceful empty
  fallback on fetch error (mirrors `FearAndGreedSource`).
- [ ] `SignalType` includes `'microstructure'`; no other source breaks.
- [ ] `fetchHistorical` implemented or explicitly returns `[]` with a comment.

**Verification:**
- [ ] Tests pass: `pnpm test -- binance-futures` (HTTP mocked)
- [ ] Build succeeds: `pnpm --filter api build`
- [ ] Manual: instantiate source, confirm live signals fetch.

**Dependencies:** None
**Files likely touched:**
`packages/api/src/market-data/sources/binance-futures.ts`,
`packages/api/src/common/types/signal.ts`,
`packages/api/src/market-data/index.ts`,
`packages/api/tests/market-data/binance-futures.test.ts`
**Estimated scope:** Medium

#### Task 3: Order-book-imbalance data source

**Description:** Extend `BinanceFuturesSource` with order-book depth imbalance —
bid vs. ask volume in the top N levels from a REST depth snapshot — emitted as
a `microstructure` `Signal` per coin (ratio + classification).

**Acceptance criteria:**
- [ ] Order-book imbalance signal emitted per coin (ratio + classification).
- [ ] Errors degrade to empty, never throw into the pipeline.

**Verification:**
- [ ] Tests pass: `pnpm test -- binance-futures`
- [ ] Build succeeds: `pnpm --filter api build`

**Dependencies:** Task 2
**Files likely touched:**
`packages/api/src/market-data/sources/binance-futures.ts`,
`packages/api/tests/market-data/binance-futures.test.ts`
**Estimated scope:** Medium

#### Task 3b: Liquidation websocket collector

**Description:** Binance has no clean REST liquidation feed, so add a long-lived
websocket collector subscribing to the futures `forceOrder` streams for the
traded coins. The collector maintains a rolling in-memory window of recent
liquidations; a `DataSource` reads that window each cycle and emits a
`microstructure` liquidation-summary `Signal` per coin (notional long vs. short
liquidated, recent cascade flag). The connection is managed as a NestJS
lifecycle component (`OnModuleInit`/`OnModuleDestroy`) with auto-reconnect.

**Acceptance criteria:**
- [ ] Websocket collector connects, buffers a rolling liquidation window, and
  auto-reconnects on drop without crashing the process.
- [ ] A `DataSource` emits a per-coin liquidation summary from the buffer;
  empty buffer degrades to no signal, never throws.
- [ ] Collector lifecycle is wired into the NestJS module and shut down cleanly.

**Verification:**
- [ ] Tests pass: `pnpm test -- liquidation` (websocket mocked)
- [ ] Build succeeds: `pnpm --filter api build`
- [ ] Manual: run the collector live, confirm liquidations buffer and a summary
  signal appears in a cycle's snapshot.

**Dependencies:** Task 2
**Files likely touched:**
`packages/api/src/market-data/sources/liquidation-collector.ts`,
`packages/api/src/market-data/sources/liquidation.source.ts`,
`packages/api/src/market-data/*.module.ts`,
`packages/api/tests/market-data/liquidation.test.ts`
**Estimated scope:** Medium

#### Task 4: Wire microstructure into the pipeline and prompt

**Description:** Register the futures source in the market-data module, add a
`{microstructure}` placeholder + renderer to `prompt-builder`, add it to
`PROMPT_PLACEHOLDERS` and the default template.

**Acceptance criteria:**
- [ ] Microstructure signals appear in the `WorldSnapshot` each cycle.
- [ ] `{microstructure}` renders grouped-by-coin; unknown windows render a
  "no data" line.
- [ ] `PROMPT_PLACEHOLDERS` lists the new placeholder; settings UI chip works.

**Verification:**
- [ ] Tests pass: `pnpm test -- prompt-builder`
- [ ] Build succeeds: `pnpm --filter api build && pnpm --filter web build`
- [ ] Manual: one live cycle shows microstructure data in the rendered prompt.

**Dependencies:** Tasks 2, 3, 3b
**Files likely touched:** `packages/api/src/market-data/*.module.ts`,
`packages/api/src/llm/prompt-builder.ts`,
`packages/api/src/common/types/settings.ts`,
`packages/api/tests/llm/prompt-builder.test.ts`
**Estimated scope:** Small

### Checkpoint: Foundation (after Tasks 1, 2, 3, 3b, 4)
- [ ] All tests pass, both packages build clean
- [ ] One live cycle produces a prompt containing `{features}` +
  `{microstructure}`, and a decision row with a `features` snapshot
- [ ] Review with human before proceeding

### Phase 2: Regime Classification (Item 6)

#### Task 5: Deterministic regime classifier

**Description:** Add `llm/regime.ts` exposing `classifyRegime(features,
btcFeatures): Regime` where `Regime` is an enum (`trending-up`,
`trending-down`, `choppy`, `crashing`, `recovering`). Pure, threshold-based on
EMA structure, RSI, realised vol, and BTC context.

**Acceptance criteria:**
- [ ] `Regime` enum + `classifyRegime` are pure and unit-tested across each
  regime's representative inputs.
- [ ] Classifier uses BTC features as market context for altcoins.

**Verification:**
- [ ] Tests pass: `pnpm test -- regime`
- [ ] Build succeeds: `pnpm --filter api build`

**Dependencies:** Task 1
**Files likely touched:** `packages/api/src/llm/regime.ts`,
`packages/api/src/common/types/decision.ts`,
`packages/api/tests/llm/regime.test.ts`
**Estimated scope:** Small

#### Task 6: Surface regime in the prompt and persist it on decisions

**Description:** Compute the regime per coin in `EvaluationCycle`, render a
`{regime}` placeholder, persist the regime on each `LlmDecision`, and add
regime-specific strategy guidance to `CORE_SYSTEM_RULES` / default strategy
prompt (e.g. mean-reversion sleeve in `choppy`, stand-down in `crashing`).

**Acceptance criteria:**
- [ ] Each decision row stores its coin's `regime`.
- [ ] `{regime}` placeholder renders per coin; added to `PROMPT_PLACEHOLDERS`.
- [ ] Strategy text gives the LLM a concrete action bias per regime.

**Verification:**
- [ ] Tests pass: `pnpm test -- evaluation-cycle prompt-builder`
- [ ] Build succeeds: `pnpm --filter api build && pnpm --filter web build`
- [ ] Manual: a cycle in a downtrend logs `regime=trending-down` and the LLM's
  reasoning references it.

**Dependencies:** Task 5
**Files likely touched:** `packages/api/src/llm/evaluation-cycle.ts`,
`packages/api/src/llm/prompt-builder.ts`,
`packages/api/src/common/types/settings.ts`,
`packages/api/src/prisma/repositories/decision.repository.ts`,
`packages/api/prisma/schema.prisma`,
`packages/api/tests/llm/evaluation-cycle.test.ts`
**Estimated scope:** Medium

### Checkpoint: Regime (after Tasks 5–6)
- [ ] All tests pass, both packages build clean
- [ ] Decisions carry a regime; prompt shows regime-specific guidance
- [ ] Review with human before proceeding

### Phase 3: Win/Loss Math — Partial Take-Profit + Trailing Exits (Item 4)

#### Task 7: Partial take-profit and tiered exits in the engine

**Description:** Let a position be partially reduced. `PositionTracker` gains
`reduce(coin, fraction)`; `TradingEngine` takes profit in tiers — e.g. sell 50%
at `takeProfit`, move the stop to break-even, let the remainder trail. This
makes average win > average loss, the missing ingredient for positive
expectancy at the bot's ~40% win rate.

**Acceptance criteria:**
- [ ] A position can be partially closed; remaining size, `baseQty`, and
  reserved capital stay consistent.
- [ ] Hitting `takeProfit` sells the configured fraction, ratchets the stop to
  break-even, and keeps the rest open on the trailing stop.
- [ ] `PositionClosedEvent` / partial-exit events persist correctly (the
  `Trade` row's `pnl` reflects realised partials).

**Verification:**
- [ ] Tests pass: `pnpm test -- trading-engine position-tracker`
- [ ] Build succeeds: `pnpm --filter api build`
- [ ] Manual: simulate a price path hitting TP1 then trailing out; confirm two
  realised legs with the expected PnL.

**Dependencies:** None
**Files likely touched:** `packages/api/src/core/trading-engine.ts`,
`packages/api/src/core/position-tracker.ts`,
`packages/api/src/common/types/trade.ts`,
`packages/api/tests/core/trading-engine.test.ts`,
`packages/api/tests/core/position-tracker.test.ts`
**Estimated scope:** Medium

#### Task 8: Expose exit parameters through settings

**Description:** Add `takeProfitTierPct` (fraction sold at TP1) and a
`breakEvenAfterTier` toggle to `BotSettings` with bounds; plumb through
`settings.service` and `engine.applySettings`.

**Acceptance criteria:**
- [ ] New settings have bounds, defaults, and normalisation.
- [ ] Changing them at runtime affects the next exit without a restart.

**Verification:**
- [ ] Tests pass: `pnpm test -- settings`
- [ ] Build succeeds: `pnpm --filter api build && pnpm --filter web build`

**Dependencies:** Task 7
**Files likely touched:** `packages/api/src/common/types/settings.ts`,
`packages/api/src/settings/settings.service.ts`,
`packages/api/src/core/trading-engine.ts`,
`packages/web/app/settings/settings-form.tsx`,
`packages/api/tests/settings/settings.service.test.ts`
**Estimated scope:** Small

### Checkpoint: Exits (after Tasks 7–8)
- [ ] All tests pass, both packages build clean
- [ ] A simulated winning trade realises a partial leg and trails the rest
- [ ] Review with human before proceeding

### Phase 4: Alpha Scoring vs. Buy-and-Hold BTC (Item 2)

#### Task 9: Benchmark return + alpha in narration stats

**Description:** Add a helper that reads BTC `Candle`s at a window's start/end
and computes buy-and-hold return. Extend `NarrationStats` with
`benchmarkReturn` and `alpha` (bot return − benchmark, both as % of capital).
`computeStats`/`aggregateStats` and the narration prompt carry these through.

**Acceptance criteria:**
- [ ] `NarrationStats` includes `benchmarkReturn` and `alpha`; computed for
  every granularity.
- [ ] A flat-cash period during a BTC rally shows negative `alpha`.
- [ ] Narration prompt input includes alpha so "doing nothing" is no longer
  framed as costless.

**Verification:**
- [ ] Tests pass: `pnpm test -- narration-stats`
- [ ] Build succeeds: `pnpm --filter api build`
- [ ] Manual: regenerate a known past day, confirm `alpha` is plausible.

**Dependencies:** None
**Files likely touched:** `packages/api/src/common/types/narration.ts`,
`packages/api/src/narration/narration-stats.ts`,
`packages/api/src/narration/narration.service.ts`,
`packages/api/src/narration/narration-prompt.ts`,
`packages/api/src/prisma/repositories/candle.repository.ts` (or new helper),
`packages/api/tests/narration/narration-stats.test.ts`
**Estimated scope:** Medium

### Phase 5: Adversarial Critic + Lessons Ledger (Item 1)

#### Task 10: `Lesson` model, repository, and migration

**Description:** Add a `Lesson` Prisma model: `text`, `category`, `evidenceFor`,
`evidenceAgainst`, `status` (`active` | `retired`), `createdAt`, `updatedAt`.
Add `LessonRepository` with upsert-by-text, evidence increment, and an
`activeLessons()` query ordered by net evidence.

**Acceptance criteria:**
- [ ] Migration adds the `Lesson` table.
- [ ] Repository supports create, evidence increment, retire, and `activeLessons`.
- [ ] Repository is unit-tested against the test DB.

**Verification:**
- [ ] Tests pass: `pnpm test -- lesson.repository`
- [ ] Build succeeds: `pnpm --filter api build`

**Dependencies:** None
**Files likely touched:** `packages/api/prisma/schema.prisma`,
`packages/api/src/prisma/repositories/lesson.repository.ts`,
`packages/api/src/common/types/lesson.ts`,
`packages/api/tests/prisma/lesson.repository.test.ts`
**Estimated scope:** Medium

#### Task 11: Rewrite narration into an adversarial post-mortem critic

**Description:** Replace the "explain to a non-technical person / judge whether
sensible" prompt in `narration-prompt.ts` with a critic that must attribute
every closed trade to a falsifiable hypothesis, judge the period against
`alpha` (not raw PnL), and emit a `lessons` array of concrete, falsifiable rule
proposals alongside `summary`/`assessment`. The narration service writes
proposed lessons through `LessonRepository`.

**Acceptance criteria:**
- [ ] Critic output schema includes `lessons: {text, category}[]`.
- [ ] A losing/flat period produces at least one concrete lesson, not praise.
- [ ] The critic is told a flat period that underperformed BTC is a failure.
- [ ] Proposed lessons are persisted/merged via `LessonRepository`.

**Verification:**
- [ ] Tests pass: `pnpm test -- narration`
- [ ] Build succeeds: `pnpm --filter api build`
- [ ] Manual: regenerate the May 11–16 flat window; confirm critical lessons.

**Dependencies:** Tasks 9, 10
**Files likely touched:** `packages/api/src/narration/narration-prompt.ts`,
`packages/api/src/narration/narration-llm.service.ts`,
`packages/api/src/narration/narration.service.ts`,
`packages/api/tests/narration/*.test.ts`
**Estimated scope:** Medium

#### Task 12: Feed the lessons ledger back into the trading prompt

**Description:** Add a `{lessons}` placeholder rendering active lessons (ordered
by net evidence). After each closed trade, increment evidence for/against the
lessons that applied, and retire lessons whose `evidenceAgainst` dominates.

**Acceptance criteria:**
- [ ] `{lessons}` placeholder renders active lessons; added to
  `PROMPT_PLACEHOLDERS` and the default template.
- [ ] Closing a trade updates evidence counts for relevant lessons.
- [ ] A lesson with strong contradicting evidence is auto-retired.

**Verification:**
- [ ] Tests pass: `pnpm test -- prompt-builder lesson`
- [ ] Build succeeds: `pnpm --filter api build && pnpm --filter web build`
- [ ] Manual: confirm a live prompt contains the lessons block.

**Dependencies:** Task 11
**Files likely touched:** `packages/api/src/llm/prompt-builder.ts`,
`packages/api/src/llm/evaluation-cycle.ts`,
`packages/api/src/trading/cycle-runner.ts`,
`packages/api/src/common/types/settings.ts`,
`packages/api/tests/llm/prompt-builder.test.ts`
**Estimated scope:** Medium

### Checkpoint: Critic + Lessons (after Tasks 9–12)
- [ ] All tests pass, both packages build clean
- [ ] Narration produces lessons; the trading prompt consumes active lessons;
  alpha is visible end-to-end
- [ ] Review with human before proceeding

### Phase 6: LLM Confidence Calibration (Item 7)

#### Task 13: Calibration computation service

**Description:** Add `CalibrationService` that joins closed `Trade`s to their
originating `LlmDecision` (via `tradeId`), buckets by predicted `confidence`
(e.g. 0.5–0.6, …, 0.9–1.0), and computes realised win rate + average PnL per
bucket. Optionally segment by `regime`.

**Acceptance criteria:**
- [ ] Service returns per-bucket {predictedConfidence, realisedWinRate,
  avgPnl, n}.
- [ ] Handles sparse buckets (n below a threshold flagged "insufficient data").
- [ ] Unit-tested with a synthetic decision/trade fixture.

**Verification:**
- [ ] Tests pass: `pnpm test -- calibration`
- [ ] Build succeeds: `pnpm --filter api build`

**Dependencies:** None (Task 6 optional, for regime segmentation)
**Files likely touched:** `packages/api/src/llm/calibration.service.ts`,
`packages/api/src/prisma/repositories/decision.repository.ts`,
`packages/api/tests/llm/calibration.test.ts`
**Estimated scope:** Medium

#### Task 14: Surface calibration in the prompt and via an endpoint

**Description:** Add a `{calibration}` placeholder rendering the calibration
curve ("your 0.8-confidence buys have won 20% historically"), wired into the
default template. Add a read endpoint for the dashboard.

**Acceptance criteria:**
- [ ] `{calibration}` placeholder renders the curve; added to
  `PROMPT_PLACEHOLDERS`.
- [ ] An HTTP endpoint returns the calibration data.
- [ ] When data is too sparse, the prompt renders a neutral "not yet
  calibrated" line.

**Verification:**
- [ ] Tests pass: `pnpm test -- prompt-builder calibration`
- [ ] Build succeeds: `pnpm --filter api build && pnpm --filter web build`
- [ ] Manual: a live prompt shows the calibration block.

**Dependencies:** Task 13
**Files likely touched:** `packages/api/src/llm/prompt-builder.ts`,
`packages/api/src/llm/evaluation-cycle.ts`,
`packages/api/src/http/*.controller.ts`,
`packages/api/src/common/types/settings.ts`,
`packages/api/tests/llm/prompt-builder.test.ts`
**Estimated scope:** Medium

### Checkpoint: Complete (after Tasks 13–14)
- [ ] All acceptance criteria met; full suite + e2e pass
- [ ] One live cycle exercises features, microstructure, regime, lessons, and
  calibration in a single prompt
- [ ] Ready for review / `check-and-commit`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Partial-exit accounting drifts (capital/baseQty/PnL) | High | Task 7 is early to fail fast; exhaustive engine tests on multi-leg paths |
| Binance futures REST shape/limits differ from spot | Med | Mock HTTP in tests; graceful empty fallback like `FearAndGreedSource` |
| Liquidation websocket drops / leaks a connection | Med | Auto-reconnect + NestJS lifecycle shutdown; collector failure degrades to no signal, never crashes the loop |
| Critic still hedges into praise | Med | Schema *requires* a non-empty `lessons` array for any losing/flat period |
| Calibration meaningless at low n (11 trades today) | Med | Bucket "insufficient data" flag; prompt renders neutral until enough data |
| Schema migrations on a live DB | Med | All new columns nullable / additive; run migrations at a checkpoint |
| Five new prompt placeholders bloat the prompt | Low | All opt-in; keep renderers terse; prompt caching already on system text |

## Open Questions

- **Calibration acting on itself:** should low realised win rate in a
  confidence bucket auto-raise `minConfidence`, or only inform the LLM via the
  prompt? Plan currently does the latter (prompt-only).
- **Backtest auto-tune (item 3)** was intentionally excluded — confirm.
