# NestJS Backend Consolidation — Design

**Date:** 2026-05-16
**Status:** Approved (design), pending implementation plan

## Goal

Collapse the current 9-package pnpm monorepo into **2 packages**:

- `api` — a single NestJS process that owns all backend logic: the trading
  engine, market data, the LLM evaluation cycle, backtesting, the live trading
  scheduler, the Telegram bot, and an HTTP API.
- `web` — the existing Next.js app, reworked to talk to `api` over HTTP instead
  of accessing the database and engine code directly.

This is a personal project. The design deliberately favours simplicity over
operational hardening. It keeps the code well-structured, consistent, and
readable, but does not add infrastructure the project does not yet need.

## Non-goals (deliberately cut)

- **No auth boundary.** The API binds to `localhost`. `web` and `api` run on the
  same machine. No tokens, no CORS gymnastics beyond what localhost needs.
- **No worker thread / queue for backtests.** Backtests run in the same process
  as the trading scheduler. Accepted risk — see below.
- **No test-runner switch.** Keep `vitest`; do not adopt Jest.

## Target architecture

```
packages/
  api/   NestJS — one process, one deployable
  web/   Next.js — HTTP client of api (localhost)
```

The 7 current libraries (`shared`, `core`, `data`, `db`, `llm`, `backtest`,
`bot`) plus `runner` collapse into `api/src/` as NestJS modules. Engine code
moves nearly verbatim; the work is import-path rewrites and dependency-injection
wiring.

### `api` modules

| Module             | From       | Role                                                        |
|--------------------|------------|-------------------------------------------------------------|
| `PrismaModule`     | `db`       | `PrismaService` + repositories exposed as providers         |
| `MarketDataModule` | `data`     | Binance / exchange feeds                                    |
| `CoreModule`       | `core`     | Trading engine, order manager, position tracker             |
| `LlmModule`        | `llm`      | Claude / OpenAI evaluation cycle, prompt builder            |
| `BacktestModule`   | `backtest` | Backtest runner, fill simulator, stats calculator           |
| `SettingsModule`   | new        | Runtime-editable `BotSettings` — read/write, normalisation  |
| `TradingModule`    | `runner`   | Live trading loop on `@nestjs/schedule`; dynamic reschedule |
| `TelegramModule`   | `bot`      | grammy long-polling provider; approval flow now in-process  |
| `common/`          | `shared`   | Plain shared types/utils — no NestJS module needed          |

The `runner`'s PID-file process model is dropped: NestJS owns the process
lifecycle, and the scheduler runs as a provider via `@nestjs/schedule`.

The `bot` <-> `runner` approval coupling, currently a cross-process concern,
becomes ordinary in-process method calls between `TelegramModule` and
`TradingModule`.

### HTTP layer

Replaces the web app's 5 API routes and 2 `actions.ts` server actions:

- `PositionsController` — `GET /positions`
- `DecisionsController` — `GET /decisions/:id`
- `BacktestController` — list runs, get run by id, start a run, and a
  `@Sse('stream')` endpoint for live backtest progress (replaces the 185-line
  Next.js streaming route).

### `web` changes

`web` loses direct Prisma and engine access. Each of the ~7 screens (home,
positions, trades, backtest, backtest/runs, backtest/runs/[id], settings) swaps
its server-side DB query or server action for a `fetch()` to the API. A small
typed API-client module is the single seam. The backtest page's SSE consumer
points at the NestJS `@Sse` endpoint; the settings page's `getBotSettings` /
`saveBotSettings` server actions become `GET` / `PUT /settings` calls.

## Detailed `api` structure

```
packages/api/
  src/
    main.ts                  # bootstrap; bind to localhost
    app.module.ts            # root module, imports all feature modules
    common/                  # ex-`shared`: plain types & utils, no DI
      types/
      ...
    prisma/
      prisma.module.ts
      prisma.service.ts      # extends PrismaClient, onModuleInit connect
      repositories/          # ex-`db` repositories as providers
        candle.repository.ts
        decision.repository.ts
        signal.repository.ts
        backtest-run.repository.ts
        bot-state.repository.ts  # key/value store; holds `settings`
    market-data/
      market-data.module.ts
      sources/binance.source.ts
      market-data.service.ts
    core/
      core.module.ts
      trading-engine.service.ts
      order-manager.service.ts
      position-tracker.service.ts
    llm/
      llm.module.ts
      adapters/claude.adapter.ts
      adapters/openai.adapter.ts
      evaluation-cycle.service.ts
      prompt-builder.ts
    backtest/
      backtest.module.ts
      backtest-runner.service.ts
      fill-simulator.ts
      historical-slice.ts
      stats-calculator.ts
    settings/
      settings.module.ts
      settings.service.ts    # get/set BotSettings via bot-state repo
      bot-settings.ts        # ex-shared: type, defaults, bounds,
                             #   normalizeBotSettings, intervalToCron
    trading/                 # ex-`runner`
      trading.module.ts
      trading.service.ts     # live loop logic (ex live-runner.ts)
      trading.scheduler.ts   # dynamic cron via SchedulerRegistry
      data-loader.service.ts
    telegram/                # ex-`bot`
      telegram.module.ts
      telegram.service.ts    # grammy bot lifecycle (long-polling)
      approval.service.ts    # approval-manager; called by trading.service
      commands.ts
      notifier.service.ts
    http/                    # HTTP controllers (DTOs colocated)
      positions.controller.ts
      decisions.controller.ts
      backtest.controller.ts
      settings.controller.ts
  tests/                     # vitest, mirrors src/
  nest-cli.json
  package.json
  tsconfig.json
```

### Module dependency graph

```
PrismaModule        <- (no app deps)
MarketDataModule    <- PrismaModule
CoreModule          <- MarketDataModule
LlmModule           <- CoreModule, MarketDataModule
BacktestModule      <- CoreModule, MarketDataModule, LlmModule, PrismaModule
SettingsModule      <- PrismaModule
TelegramModule      <- PrismaModule
TradingModule       <- CoreModule, MarketDataModule, LlmModule, PrismaModule,
                       SettingsModule, TelegramModule    (@nestjs/schedule)
HttpModule (controllers) <- BacktestModule, SettingsModule, PrismaModule
```

`common/` holds plain types/functions imported anywhere; it is not a NestJS
module. The graph stays acyclic, matching today's package layering — the
boundaries are now enforced by ESLint module-boundary rules rather than by
separate packages.

### HTTP API surface

All routes served from `localhost`, JSON unless noted. Shapes match what the
current Next.js routes/actions return so `web` consumers change only their data
source, not their rendering.

| Method | Path                    | Replaces                              | Returns |
|--------|-------------------------|---------------------------------------|---------|
| GET    | `/positions`            | `app/api/positions/route.ts`          | Open positions list |
| GET    | `/decisions/:id`        | `app/api/decisions/[id]/route.ts`     | Single decision detail |
| GET    | `/backtest/runs`        | `app/api/backtest/runs/route.ts`      | Backtest run summaries |
| GET    | `/backtest/runs/:id`    | `app/api/backtest/runs/[id]/route.ts` | Single run + stats |
| POST   | `/backtest/runs`        | `app/backtest/actions.ts` (start)     | Created run id |
| GET    | `/backtest/stream`      | `app/api/backtest/stream/route.ts`    | `text/event-stream` (`@Sse`) progress events |
| GET    | `/settings`             | `app/settings/actions.ts` (`getBotSettings`) | Current `BotSettings` (defaults fill gaps) |
| PUT    | `/settings`             | `app/settings/actions.ts` (`saveBotSettings`) | Normalised `BotSettings` actually saved |

The `@Sse('/backtest/stream')` endpoint returns an RxJS `Observable` of
`MessageEvent`s; `BacktestRunnerService` emits progress through a `Subject` the
controller subscribes to. This replaces the manual `ReadableStream` plumbing in
the 185-line Next.js route.

DTOs (request/response types) live next to their controller and reuse
`common/` types where possible to avoid drift.

## Settings integration

A runtime-editable settings feature already exists in this branch's working
tree (uncommitted) and must be carried through the migration rather than
rebuilt. Its current shape:

- `BotSettings` — a flat type of 6 numeric fields (`runIntervalMinutes`,
  `minConfidence`, `riskPerTradePct`, `maxPositions`, `dailyLossLimitPct`,
  `autoTradeLimit`), with `DEFAULT_BOT_SETTINGS`, `BOT_SETTINGS_BOUNDS`,
  `normalizeBotSettings` (clamps untrusted input), and `intervalToCron`.
- Persistence: a `BotState` key/value table; settings live under the
  `settings` key, read/written via `BotStateRepository.getSettings/setSettings`.
- The live runner re-reads settings at the **start of every cycle**, so changes
  apply without a process restart. The engine and evaluation cycle expose
  `applySettings()`; the scheduler exposes `reschedule()`.
- Restart-only config (API keys, coins, timeframe, paper mode) deliberately
  stays in `.env` and is **not** part of `BotSettings`.

How it lands in the NestJS design:

- `BotSettings` and its helpers move to `settings/bot-settings.ts` (a `common/`
  candidate, kept in the settings folder for cohesion).
- `BotStateRepository` becomes a provider in `PrismaModule`.
- `SettingsModule` exposes a `SettingsService` (`get()` / `save()`, both running
  values through `normalizeBotSettings`) — the single source of truth consumed
  by both `TradingModule` and `SettingsController`.
- `TradingService` injects `SettingsService` and re-reads settings each cycle,
  applying them via the engine/evaluation `applySettings()` methods — preserving
  the current no-restart behaviour.
- The scheduler's runtime reschedule uses `@nestjs/schedule`'s
  `SchedulerRegistry`: when `runIntervalMinutes` changes, the trading cron job
  is removed and re-added with the new `intervalToCron` expression. This
  replaces the `runner`'s `scheduler.reschedule()`.
- `SettingsController` serves `GET/PUT /settings`, replacing the
  `getBotSettings` / `saveBotSettings` server actions.

## Accepted risk

A long backtest runs in the same process as the trading `@Cron`. For a personal
project with an infrequent trading cadence this is acceptable. If a backtest is
ever observed delaying a live trade decision, the fix is to move backtests onto
a queue or worker thread — explicitly out of scope for now.

## Phasing

The work ships in two phases so the system is verifiable between them.

### Phase 1 — Build the `api` package

Create `packages/api` as a new NestJS package **alongside** the existing
packages. Move engine code in, wire modules, build the scheduler, the Telegram
module, and the HTTP controllers.

**Exit criteria — "works as before":**

- The live trading loop runs under NestJS and behaves as the old `runner` did.
- Editing settings via `PUT /settings` takes effect on the next cycle without a
  restart, and changing `runIntervalMinutes` reschedules the trading cron.
- The Telegram bot connects and the approval flow works end-to-end.
- All migrated unit tests pass under `vitest`.
- The HTTP endpoints return the same data the old Next.js routes/actions did,
  verified by hitting them directly (e.g. `curl`) and comparing against the
  current web app.

The existing `web` app is left untouched in Phase 1 and continues to run against
the old packages. Both stacks coexist until Phase 1 is verified.

### Phase 2 — Migrate `web` and remove old packages

Rework the Next.js screens to fetch from the `api`. Once `web` runs fully
against the API, delete the now-unused `shared`, `core`, `data`, `db`, `llm`,
`backtest`, `bot`, and `runner` packages and update `turbo.json` / workspace
config to the final 2-package layout.

## Effort estimate

Roughly 3–4 focused sessions, mostly mechanical:

- ~1 session: scaffold `api`, move engine modules, fix imports.
- ~1 session: `TradingModule` (scheduler + dynamic reschedule), `SettingsModule`,
  and `TelegramModule`.
- ~1 session: HTTP controllers, the SSE endpoint, settings endpoints.
- ~1 session: `web` migration and test import fixes.
