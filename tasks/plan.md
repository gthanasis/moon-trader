# Implementation Plan: NestJS Backend Consolidation

Spec: `docs/superpowers/specs/2026-05-16-nestjs-backend-design.md`

## Overview

Collapse the 9-package monorepo into 2 packages — `api` (NestJS) and `web`
(Next.js). Phase 1 builds `packages/api` **alongside** the existing packages and
verifies it behaves as the old `runner` + web server routes did. Phase 2
migrates `web` onto the API and deletes the now-dead packages.

## Architecture Decisions

- **Build `api` alongside the old packages.** The old `runner`/`web` keep
  working until Phase 1 is verified — no flag day.
- **Engine code moves nearly verbatim.** Classes (`TradingEngine`,
  `EvaluationCycle`, repositories…) become NestJS providers; the work is
  import-path rewrites + DI wiring, not rewrites.
- **Prisma ownership moves to `api`.** `packages/db/prisma/` (schema +
  migrations) relocates to `packages/api/prisma/`.
- **Scheduler uses `@nestjs/schedule` `SchedulerRegistry`** for the runtime
  reschedule when `runIntervalMinutes` changes.
- **Keep `vitest`.** Do not adopt Jest. Test files move with their code.
- **No auth.** API binds to `localhost`.
- **Settings feature is already in this branch** (uncommitted) — Phase 1
  absorbs it like any other code; no separate coordination.

## Dependency Graph

```
Task 1  api scaffold
   │
Task 2  PrismaModule ───────────────┐
   │                                │
Task 3  common/ + MarketDataModule  │
   │                                │
Task 4  CoreModule                  │
   │                                │
Task 5  LlmModule                   │
   │         │                      │
Task 6  BacktestModule              │
Task 7  SettingsModule ─────────────┤
Task 8  TelegramModule ─────────────┤
   │                                │
Task 9  TradingModule (needs 4,5,7,8)│
   │                                │
Task 10 HTTP controllers (needs 2,6,7)
   │
── Phase 2 ──
Task 11 web API client
Task 12 web read screens (12 needs 11)
Task 13 web backtest screens + SSE
Task 14 web settings screen
Task 15 delete old packages + workspace cleanup
```

Order is bottom-up: foundations (Prisma, leaf modules) first, then modules that
compose them, then HTTP, then web.

## Task List

### Phase 1: Build the `api` package

---

#### Task 1: Scaffold `packages/api` NestJS package

**Description:** Create a new `packages/api` NestJS app that boots, binds to
`localhost`, exposes a `GET /health`, and is wired into pnpm/turbo. No engine
code yet.

**Acceptance criteria:**
- [ ] `packages/api` has `package.json`, `tsconfig.json`, `nest-cli.json`,
  `src/main.ts`, `src/app.module.ts`.
- [ ] `main.ts` binds to `127.0.0.1` and reads `PORT`/`.env` via `ConfigModule`.
- [ ] `GET /health` returns `200`.

**Verification:**
- [ ] `pnpm --filter api build` succeeds.
- [ ] `pnpm --filter api start` boots; `curl localhost:<port>/health` → `200`.

**Dependencies:** None
**Files likely touched:** `packages/api/package.json`, `tsconfig.json`,
`nest-cli.json`, `src/main.ts`, `src/app.module.ts`, `turbo.json`
**Estimated scope:** M

---

#### Task 2: PrismaModule — port `db`

**Description:** Move `packages/db/prisma/` (schema + migrations) into
`packages/api/prisma/`. Create `PrismaService` (extends `PrismaClient`,
connects `onModuleInit`) and a `PrismaModule` exposing every repository
(`Trade`, `Signal`, `Decision`, `Candle`, `BotState`, `BacktestRun`) as
providers. Repository classes move verbatim, constructor-injected with
`PrismaService`.

**Acceptance criteria:**
- [ ] `prisma generate` works from `packages/api`.
- [ ] `PrismaModule` exports all 6 repositories as injectable providers.
- [ ] Repository unit tests move to `packages/api/tests` and pass.

**Verification:**
- [ ] `pnpm --filter api build` succeeds.
- [ ] `pnpm --filter api test` — migrated repository tests pass.
- [ ] `PrismaService` connects against the docker Postgres.

**Dependencies:** Task 1
**Files likely touched:** `packages/api/prisma/**`, `src/prisma/*.ts`,
`src/prisma/repositories/*.ts`, `tests/**`
**Estimated scope:** L

---

#### Task 3: `common/` + MarketDataModule — port `shared` and `data`

**Description:** Move `shared` types/utils to `packages/api/src/common/`.
Port `data` (Binance + other sources, `Pipeline`) into `MarketDataModule`,
exposing a `MarketDataService`/`Pipeline` provider.

**Acceptance criteria:**
- [ ] `common/` holds all `shared` types; no NestJS module.
- [ ] `MarketDataModule` exports the pipeline/sources as providers.
- [ ] Migrated `data` tests pass.

**Verification:**
- [ ] `pnpm --filter api build` succeeds.
- [ ] `pnpm --filter api test` — data + Binance tests pass.

**Dependencies:** Task 1
**Files likely touched:** `src/common/**`, `src/market-data/**`, `tests/**`
**Estimated scope:** M

---

#### Task 4: CoreModule — port `core`

**Description:** Port `core` (`TradingEngine`, `OrderManager`,
`PositionTracker`, `CapitalGuard`, `ExchangeAdapter`) into `CoreModule`.
`TradingEngine` retains its `applySettings()` method.

**Acceptance criteria:**
- [ ] `CoreModule` exports the engine + managers as providers.
- [ ] Migrated `core` tests pass (order-manager, position-tracker, engine).

**Verification:**
- [ ] `pnpm --filter api build` succeeds.
- [ ] `pnpm --filter api test` — core tests pass.

**Dependencies:** Task 3
**Files likely touched:** `src/core/**`, `tests/**`
**Estimated scope:** M

---

#### Checkpoint A: Foundation
- [ ] `pnpm --filter api build` and `test` both clean.
- [ ] Prisma connects; repositories injectable.
- [ ] Core + market-data tests green.
- [ ] Review with human before proceeding.

---

#### Task 5: LlmModule — port `llm`

**Description:** Port `llm` (`ClaudeAdapter`, `OpenAIAdapter`, `buildPrompt`,
`EvaluationCycle`) into `LlmModule`. `EvaluationCycle` keeps `applySettings()`.
Adapter selection (anthropic/openai) driven by `ConfigModule`.

**Acceptance criteria:**
- [ ] `LlmModule` exports `EvaluationCycle` + adapters as providers.
- [ ] Migrated `llm` tests pass.

**Verification:**
- [ ] `pnpm --filter api build` + `test` pass.

**Dependencies:** Task 4
**Files likely touched:** `src/llm/**`, `tests/**`
**Estimated scope:** M

---

#### Task 6: BacktestModule — port `backtest`

**Description:** Port `backtest` (`BacktestRunner`, `FillSimulator`,
`HistoricalSlice`, `StatsCalculator`) into `BacktestModule`. Expose a progress
`Subject`/`Observable` on the runner so the SSE controller (Task 10) can
subscribe.

**Acceptance criteria:**
- [ ] `BacktestModule` exports `BacktestRunnerService` as a provider.
- [ ] Progress is observable via an RxJS stream.
- [ ] Migrated `backtest` tests pass.

**Verification:**
- [ ] `pnpm --filter api build` + `test` pass.

**Dependencies:** Task 5
**Files likely touched:** `src/backtest/**`, `tests/**`
**Estimated scope:** M

---

#### Task 7: SettingsModule — port the settings feature

**Description:** Move `shared/types/settings.ts` to
`src/settings/bot-settings.ts`. Create `SettingsService` (`get()` / `save()`,
both via `normalizeBotSettings`, backed by `BotStateRepository`) and
`SettingsModule`.

**Acceptance criteria:**
- [ ] `SettingsService.get()` returns defaults when no row exists.
- [ ] `SettingsService.save()` clamps to bounds before persisting.
- [ ] A unit test covers normalisation + round-trip.

**Verification:**
- [ ] `pnpm --filter api build` + `test` pass.

**Dependencies:** Task 2
**Files likely touched:** `src/settings/**`, `tests/settings/**`
**Estimated scope:** S

---

#### Task 8: TelegramModule — port `bot`

**Description:** Port `bot` (grammy `Bot`, `BotNotifier`, `ApprovalManager`,
commands) into `TelegramModule`. The bot starts long-polling `onModuleInit`
and stops `onModuleDestroy`. `ApprovalManager` and `BotNotifier` become
injectable providers consumed by `TradingModule`.

**Acceptance criteria:**
- [ ] Bot connects and long-polls when `TELEGRAM_*` env is set; no-ops cleanly
  when unset.
- [ ] `ApprovalService` + `NotifierService` exported as providers.

**Verification:**
- [ ] `pnpm --filter api build` + `test` pass.
- [ ] Manual: with a real token, `/start` responds in Telegram.

**Dependencies:** Task 2
**Files likely touched:** `src/telegram/**`, `tests/**`
**Estimated scope:** M

---

#### Task 9: TradingModule — port `runner` (scheduler + live loop)

**Description:** Port `live-runner.ts` into `TradingService` and `scheduler.ts`
into `TradingScheduler`. The scheduler registers a cron job via
`SchedulerRegistry`; when `SettingsService` reports a changed
`runIntervalMinutes`, it removes and re-adds the job using `intervalToCron`.
`TradingService` re-reads settings each cycle and calls `applySettings()` on
the engine + evaluation cycle. Drop the PID-file model. Restart-only config
(API keys, coins, paper) read from `ConfigModule`.

**Acceptance criteria:**
- [ ] Live loop runs on the cron interval and executes a full evaluation cycle.
- [ ] Changing `runIntervalMinutes` reschedules the cron without a restart.
- [ ] Settings changes apply on the next cycle without a restart.

**Verification:**
- [ ] `pnpm --filter api build` + `test` pass.
- [ ] Manual (paper mode): start `api`, observe a cycle log; change settings,
  observe reschedule + new values applied.

**Dependencies:** Tasks 4, 5, 7, 8
**Files likely touched:** `src/trading/**`, `tests/**`
**Estimated scope:** L

---

#### Task 10: HTTP controllers

**Description:** Add `PositionsController` (`GET /positions`),
`DecisionsController` (`GET /decisions/:id`), `BacktestController` (list/get
runs, `POST /backtest/runs`, `@Sse('/backtest/stream')`), and
`SettingsController` (`GET`/`PUT /settings`). DTOs colocated, reusing `common/`
types. Response shapes match the current Next.js routes/actions.

**Acceptance criteria:**
- [ ] All 8 endpoints (per spec table) return data matching the old routes.
- [ ] `/backtest/stream` emits SSE progress events from the runner's Observable.
- [ ] `PUT /settings` persists clamped values and returns them.

**Verification:**
- [ ] `pnpm --filter api build` + `test` pass.
- [ ] Manual: `curl` each endpoint, diff output against the running old web app.

**Dependencies:** Tasks 6, 7 (and 2)
**Files likely touched:** `src/http/**`, `tests/http/**`
**Estimated scope:** L

---

#### Checkpoint B: `api` complete — "works as before"
- [ ] `pnpm --filter api build` + `test` fully green.
- [ ] Live trading loop verified in paper mode.
- [ ] Telegram approval flow verified end-to-end.
- [ ] Settings edit applies without restart + reschedules cron.
- [ ] Every HTTP endpoint diffed against the old web app.
- [ ] **Human review before starting Phase 2.**

---

### Phase 2: Migrate `web`, remove old packages

---

#### Task 11: Typed API client in `web`

**Description:** Add `web/lib/api-client.ts` — a small typed wrapper over
`fetch` for every `api` endpoint, with the base URL from env. Reuses
`BotSettings` and other types (copied or published from `api`'s `common`).

**Acceptance criteria:**
- [ ] One typed function per endpoint.
- [ ] Base URL configurable via `NEXT_PUBLIC_API_URL` / server env.

**Verification:**
- [ ] `pnpm --filter web build` succeeds.

**Dependencies:** Task 10
**Files likely touched:** `web/lib/api-client.ts`, `web/.env`
**Estimated scope:** S

---

#### Task 12: Migrate read screens

**Description:** Rework home, positions, trades, and decision screens to fetch
via the API client instead of querying Prisma directly. Remove their
server-side DB imports.

**Acceptance criteria:**
- [ ] Home, positions, trades render from API data.
- [ ] No `@trader/db` import remains in these screens.

**Verification:**
- [ ] `pnpm --filter web build` succeeds.
- [ ] Manual: each screen matches the pre-migration output.

**Dependencies:** Task 11
**Files likely touched:** `web/app/page.tsx`, `web/app/positions/page.tsx`,
`web/app/trades/page.tsx`, `web/components/*`
**Estimated scope:** M

---

#### Task 13: Migrate backtest screens + SSE consumer

**Description:** Rework the backtest pages (`backtest`, `backtest/runs`,
`backtest/runs/[id]`) and the start-run action to use the API client. Repoint
the SSE consumer at `api`'s `/backtest/stream`. Delete `web/app/api/**` routes
and `web/app/backtest/actions.ts`.

**Acceptance criteria:**
- [ ] Backtest list/detail render from the API.
- [ ] Starting a run streams live progress from the NestJS `@Sse` endpoint.
- [ ] `web/app/api/**` deleted.

**Verification:**
- [ ] `pnpm --filter web build` succeeds.
- [ ] Manual: run a backtest end-to-end with live progress.

**Dependencies:** Task 11
**Files likely touched:** `web/app/backtest/**`, delete `web/app/api/**`
**Estimated scope:** M

---

#### Task 14: Migrate settings screen

**Description:** Rework `web/app/settings/` to use `GET`/`PUT /settings` via
the API client instead of the `getBotSettings`/`saveBotSettings` server
actions. Delete `web/app/settings/actions.ts`.

**Acceptance criteria:**
- [ ] Settings form loads and saves through the API.
- [ ] `web/app/settings/actions.ts` deleted.

**Verification:**
- [ ] `pnpm --filter web build` succeeds.
- [ ] Manual: edit a setting, confirm `api` applies it next cycle.

**Dependencies:** Task 11
**Files likely touched:** `web/app/settings/page.tsx`, `settings-form.tsx`,
delete `actions.ts`
**Estimated scope:** S

---

#### Task 15: Delete old packages + workspace cleanup

**Description:** Delete `packages/{shared,core,data,db,llm,backtest,bot,runner}`.
Update `pnpm-workspace.yaml`, `turbo.json`, root scripts, `vitest.config.ts`,
and docker/dev orchestration for the final 2-package layout.

**Acceptance criteria:**
- [ ] Only `packages/api` and `packages/web` remain.
- [ ] No dangling `@trader/*` references.

**Verification:**
- [ ] `pnpm install` clean.
- [ ] `pnpm build` and `pnpm test` pass for the whole repo.
- [ ] `pnpm dev` starts both `api` and `web`.

**Dependencies:** Tasks 12, 13, 14
**Files likely touched:** `pnpm-workspace.yaml`, `turbo.json`, `package.json`,
`vitest.config.ts`, `docker-compose.yml`, delete 8 package dirs
**Estimated scope:** M

---

#### Checkpoint C: Complete
- [ ] Repo is 2 packages; full `build` + `test` green.
- [ ] Live trading, Telegram, backtest, settings all verified.
- [ ] Ready for merge to `main`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Backtest SSE port (185-line route → `@Sse`) is fiddly | Med | Isolated in Task 10; verify with a real run against the Observable |
| Backtest shares process with trading cron — could starve it | Med | Accepted for now (spec); revisit with a queue if observed |
| Settings live in this branch uncommitted — easy to lose | Med | Commit current working tree before Task 1 starts |
| ESM `.js` import suffixes vs. Nest conventions | Low | Decide module resolution in Task 1; apply consistently |
| Prisma schema move breaks migration history | Med | Move `prisma/` whole (schema + migrations); run `prisma generate` early in Task 2 |
| `vitest` config for a Nest project | Low | Keep root `vitest.config.ts`; adjust paths in Task 15 |

## Open Questions

- None blocking. `NEXT_PUBLIC_API_URL` default and final dev-orchestration
  shape are decided inline during Tasks 11 and 15.
