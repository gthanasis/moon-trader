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
- [ ] Task 2: Funding-rate + open-interest data source
- [ ] Task 3: Order-book-imbalance data source
- [ ] Task 3b: Liquidation websocket collector
- [ ] Task 4: Wire microstructure into pipeline + `{microstructure}` placeholder
- [ ] **Checkpoint:** tests + builds green; `{features}`/`{microstructure}` in a live prompt — human review

## Phase 2 — Regime Classification (Item 6)
- [ ] Task 5: Deterministic regime classifier (`classifyRegime`)
- [ ] Task 6: Surface `{regime}` in prompt, persist on decisions, regime guidance
- [ ] **Checkpoint:** decisions carry regime; regime-specific guidance live — human review

## Phase 3 — Win/Loss Math: Partial TP + Trailing (Item 4)
- [ ] Task 7: Partial take-profit + tiered exits in the engine
- [ ] Task 8: Expose exit parameters through settings
- [ ] **Checkpoint:** simulated winner realises a partial leg + trails — human review

## Phase 4 — Alpha Scoring vs Buy-and-Hold BTC (Item 2)
- [ ] Task 9: Benchmark return + `alpha` in `NarrationStats`

## Phase 5 — Adversarial Critic + Lessons Ledger (Item 1)
- [ ] Task 10: `Lesson` model, repository, migration
- [ ] Task 11: Rewrite narration into adversarial post-mortem critic
- [ ] Task 12: Feed lessons ledger back into the trading prompt
- [ ] **Checkpoint:** narration emits lessons; prompt consumes them; alpha end-to-end — human review

## Phase 6 — LLM Confidence Calibration (Item 7)
- [ ] Task 13: Calibration computation service
- [ ] Task 14: Surface `{calibration}` in prompt + read endpoint
- [ ] **Checkpoint:** full suite + e2e pass; one cycle exercises all five new inputs — ready for review
