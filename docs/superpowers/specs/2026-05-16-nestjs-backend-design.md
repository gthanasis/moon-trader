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
| `TradingModule`    | `runner`   | Live trading loop on `@nestjs/schedule` `@Cron`             |
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

`web` loses direct Prisma and engine access. Each of the ~6 screens (home,
positions, trades, backtest, backtest/runs, backtest/runs/[id]) swaps its
server-side DB query for a `fetch()` to the API. A small typed API-client module
is the single seam. The backtest page's SSE consumer points at the NestJS
`@Sse` endpoint.

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
    trading/                 # ex-`runner`
      trading.module.ts
      trading.service.ts     # live loop logic (ex live-runner.ts)
      trading.scheduler.ts   # @Cron entrypoint -> trading.service
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
TelegramModule      <- PrismaModule
TradingModule       <- CoreModule, MarketDataModule, LlmModule, PrismaModule,
                       TelegramModule          (@nestjs/schedule)
HttpModule (controllers) <- BacktestModule, PrismaModule
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

The `@Sse('/backtest/stream')` endpoint returns an RxJS `Observable` of
`MessageEvent`s; `BacktestRunnerService` emits progress through a `Subject` the
controller subscribes to. This replaces the manual `ReadableStream` plumbing in
the 185-line Next.js route.

DTOs (request/response types) live next to their controller and reuse
`common/` types where possible to avoid drift.

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
- ~1 session: `TradingModule` (scheduler) and `TelegramModule`.
- ~1 session: HTTP controllers and the SSE endpoint.
- ~1 session: `web` migration and test import fixes.
