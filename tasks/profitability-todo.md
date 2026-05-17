# TODO: Trading-Bot Profitability Improvements

Full detail in `tasks/profitability-plan.md`. Items map to the original
numbering (1 critic+lessons, 2 alpha, 4 exits, 5 features+microstructure,
6 regime, 7 calibration).

## Phase 0 — Mechanical Bug Fixes
- [x] Task 0: stop-clamp + bounded scale-in done (commit 81aa563). Sub-fix (a)
      no-fill-price gate descoped — root cause is `BinanceSource.fetchOhlcv`
      silently dropping coins; fold into Phase 1 market-data work.

## Phase 1 — Deterministic Features + Microstructure (Item 5)
- [x] Task 1: typed `FeatureSet` + `computeFeatures`, `{features}` placeholder,
      `LlmDecision.features` JSONB snapshot (migration 20260517000000)
- [x] Task 2: `BinanceFuturesSource` — funding rate + open interest, `microstructure` SignalType
- [x] Task 3: Order-book depth imbalance added to `BinanceFuturesSource`
- [x] Task 3b: `LiquidationCollector` (ws stream, auto-reconnect, rolling
      window) + `LiquidationSource`. NestJS provider registration → Task 4.
- [x] Task 4: futures + liquidation sources wired into the live pipeline;
      `{microstructure}` placeholder + default template; collector lifecycle
      on TradingService onModuleDestroy
- [x] **Checkpoint:** 331 tests + api/web builds green — awaiting human review

## Phase 2 — Regime Classification (Item 6)
- [x] Task 5: `Regime` type + pure `classifyRegime` (BTC-context aware)
- [x] Task 6: `{regime}` placeholder + default template, `LlmDecision.regime`
      column (migration 20260517010000), regime playbook in CORE_SYSTEM_RULES
- [x] **Checkpoint:** 343 tests + api/web builds green — awaiting human review

## Phase 3 — Win/Loss Math: Partial TP + Trailing (Item 4)
- [x] Task 7: partial take-profit — first TP touch banks a tier, moves stop to
      break-even, clears TP so remainder trails; total PnL across legs
- [x] Task 8: `takeProfitTierPct` + `breakEvenAfterTier` in BotSettings (bounds,
      defaults, normalize, engine.applySettings); `takeProfitTierPct` in web
      form. `breakEvenAfterTier` is API/normalize-settable; no dedicated UI toggle.
- [x] **Checkpoint:** 348 tests + api/web builds green — awaiting human review

## Phase 4 — Alpha Scoring vs Buy-and-Hold BTC (Item 2)
- [x] Task 9: `CandleRepository.priceReturn`, `NarrationStats.benchmarkReturn`
      + `alpha`, narration prompt shows BTC benchmark vs bot alpha

## Phase 5 — Adversarial Critic + Lessons Ledger (Item 1)
- [x] Task 10: `Lesson` model + `LessonRepository` (propose/addEvidence/
      activeLessons, auto-retire) + migration 20260517020000
- [x] Task 11: narration rewritten into an adversarial post-mortem critic —
      judges alpha not raw PnL, emits falsifiable lessons + lesson verdicts
- [x] Task 12: `{lessons}` placeholder feeds active lessons into the trading
      prompt; critic verdicts tally evidence and auto-retire contradicted lessons
- [x] **Checkpoint:** 361 tests + api/web builds green — awaiting human review

## Phase 6 — LLM Confidence Calibration (Item 7)
- [x] Task 13: `CalibrationService` + pure `bucketOutcomes` —
      `DecisionRepository.findConfidenceOutcomes` joins closed trades to
      decisions, buckets by predicted confidence vs realised win rate
- [x] Task 14: `{calibration}` placeholder (hides sparse bands) + default
      template; `GET /calibration` endpoint
- [x] **Checkpoint:** 369 unit tests + api/web builds green. e2e not run
      (needs a live server + DB) — ready for review
