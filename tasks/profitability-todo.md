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
- [ ] Task 10: `Lesson` model, repository, migration
- [ ] Task 11: Rewrite narration into adversarial post-mortem critic
- [ ] Task 12: Feed lessons ledger back into the trading prompt
- [ ] **Checkpoint:** narration emits lessons; prompt consumes them; alpha end-to-end — human review

## Phase 6 — LLM Confidence Calibration (Item 7)
- [ ] Task 13: Calibration computation service
- [ ] Task 14: Surface `{calibration}` in prompt + read endpoint
- [ ] **Checkpoint:** full suite + e2e pass; one cycle exercises all five new inputs — ready for review
