# TODO: NestJS Backend Consolidation

Plan: `tasks/plan.md` · Spec: `docs/superpowers/specs/2026-05-16-nestjs-backend-design.md`

## Phase 1 — Build the `api` package

- [x] Task 1: Scaffold `packages/api` NestJS package — M
- [x] Task 2: PrismaModule — port `db` — L
- [x] Task 3: `common/` + MarketDataModule — port `shared`/`data` — M
- [x] Task 4: CoreModule — port `core` — M
- [ ] **Checkpoint A: Foundation** — build/test green, human review
- [x] Task 5: LlmModule — port `llm` — M
- [x] Task 6: BacktestModule — port `backtest` — M
- [x] Task 7: SettingsModule — port settings feature — S
- [x] Task 8: TelegramModule — port `bot` — M
- [x] Task 9: TradingModule — port `runner` (scheduler + live loop) — L
- [x] Task 10: HTTP controllers (positions/decisions/backtest+SSE/settings) — L
- [ ] **Checkpoint B: `api` complete — "works as before"** — human review

## Phase 2 — Migrate `web`, remove old packages

- [x] Task 11: Typed API client in `web` — S
- [x] Task 12: Migrate read screens (home/positions/trades/decisions) — M
- [x] Task 13: Migrate backtest screens + SSE consumer — M
- [x] Task 14: Migrate settings screen — S
- [ ] Task 15: Delete old packages + workspace cleanup — M
- [ ] **Checkpoint C: Complete** — full build/test green, ready to merge
