# Implementation Plan: Home Dashboard + Hierarchical Narration

Spec: `docs/superpowers/specs/2026-05-16-home-dashboard-narration-design.md`

## Overview

Three components, built backend-first so the web layer has real endpoints to
consume: (1) the narration system, (2) the SSE `/events` channel, (3) the
single-screen home redesign.

## Dependency Graph

```
Narration model + repo (T1)
        │
NarrationService: 6h generation (T2)
        │
Roll-ups: day/week/month (T3)
        │
Cron wiring (T4) ── GET /narrations (T5) ── Backfill script (T6)
                                    │
EventsService + SSE (T7) ── emit hooks (T8)
                                    │
web api-client + hooks (T9)
        │
dashboard components (T10)
        │
single-screen page (T11)
```

Backend (T1–T8) before web (T9–T11). Within the backend, narration (T1–T6) and
events (T7–T8) are independent and could be parallelised.

## Architecture Decisions

- **Roll-ups summarize child narrations, not raw trades** — a `week` LLM call
  summarizes 7 `day` summaries. Cheaper, and the hierarchy mirrors the UI zoom.
- **One SSE Subject** — `EventsService` owns a single RxJS `Subject`; every
  `/events` client subscribes to it. No per-client state.
- **SSE feeds the React Query cache** — events call `setQueryData` /
  `invalidateQueries`, so existing `useQuery` consumers update with no bespoke
  socket state.
- **Backfill is idempotent** — `@@unique([granularity, periodStart])` lets the
  backfill and the crons run safely over the same periods.

## Task List

### Phase 1 — Narration backend

#### Task 1: Narration model + repository
- Acceptance: `Narration` model added to `schema.prisma`; migration created;
  `NarrationRepository` with `upsert(narration)`, `find(granularity, from, to)`,
  `findChildren(parentGranularity, period)`.
- Verify: `prisma migrate`, `pnpm --filter @trader/api build`, repo unit test.
- Files: `prisma/schema.prisma`, `prisma/migrations/**`,
  `src/prisma/repositories/narration.repository.ts`, `src/prisma/prisma.module.ts`.

#### Task 2: NarrationService — 6h generation
- Acceptance: `generateBlock(periodStart, '6h')` reads trades + decisions for the
  window, computes `stats`, calls the LLM adapter for `summary` + `assessment`,
  upserts a `Narration`.
- Verify: unit test with a mocked LLM adapter — stats math + upsert; build.
- Files: `src/narration/narration.service.ts`, `narration-prompt.ts`,
  `tests/narration/narration.service.test.ts`.

#### Task 3: Roll-up generation (day/week/month)
- Acceptance: `generateRollup(periodStart, granularity)` gathers child
  narrations, LLM-summarizes them into the parent; period-boundary helpers
  (`blocksIn`, `parentPeriodOf`) unit-tested; raw-trade fallback when no
  children exist.
- Verify: unit tests for boundary math + roll-up; build.
- Files: `src/narration/narration.service.ts`, `narration-periods.ts`, tests.

#### Task 4: Cron wiring
- Acceptance: `NarrationModule` schedules 6h / daily / weekly / monthly
  generation via the existing `Scheduler`; runs off the trading loop (never
  blocks a cycle).
- Verify: build; manual — boot api, observe a scheduled run logs.
- Files: `src/narration/narration.module.ts`, `narration.scheduler.ts`,
  `src/app.module.ts`.

#### Task 5: GET /narrations
- Acceptance: `NarrationController` `GET /narrations?granularity=&from=&to=`;
  `pickGranularity(spanMs)` helper (≥2mo→month, ≥2wk→week, …).
- Verify: build; `curl` the endpoint; unit test for `pickGranularity`.
- Files: `src/http/narration.controller.ts`, `src/http/http.module.ts`.

#### Task 6: Backfill script
- Acceptance: `src/narration/backfill.ts` generates narrations bottom-up for all
  existing trades; idempotent; runnable via `tsx`.
- Verify: run against the dev DB; re-run is a no-op.
- Files: `src/narration/backfill.ts`, `package.json` script.

#### Checkpoint A — Narration backend
- [ ] build + tests green; `/narrations` returns data; backfill populated the
      timeline; human review.

### Phase 2 — Real-time events

#### Task 7: EventsService + SSE endpoint
- Acceptance: `EventsService` wraps an RxJS `Subject<AppEvent>`;
  `EventsController` `@Sse('/events')` streams it; `AppEvent` union typed in
  `common`.
- Verify: unit test (subscribe/emit/receive); `curl -N /events`; build.
- Files: `src/events/events.{module,service,controller}.ts`,
  `src/common/types/events.ts`.

#### Task 8: Emit events from the trading loop
- Acceptance: `TradingService` emits `cycle_started`, `decision_made`,
  `trade_opened`, `trade_closed`, `signals_ingested` into `EventsService`.
- Verify: build; manual — paper cycle, watch `/events` emit.
- Files: `src/trading/trading.service.ts`, `src/trading/cycle-runner.ts`.

#### Checkpoint B — Events
- [ ] `/events` pushes live during a paper cycle; build + tests green.

### Phase 3 — Web dashboard

#### Task 9: web data layer
- Acceptance: `api-client` gains `getNarrations`; `queries.ts` gains
  `useNarrations`; `lib/use-app-events.ts` opens one `EventSource` and bridges
  events into the React Query cache.
- Verify: `pnpm --filter @trader/web build`.
- Files: `lib/api-client.ts`, `lib/queries.ts`, `lib/use-app-events.ts`.

#### Task 10: dashboard components
- Acceptance: `PnlHero`, `NarrationPanel` (zoom breadcrumb month→…→6h),
  `LiveActivityFeed` (last-N + SSE prepend), `SignalsSummary` (collapsed line,
  expands `SignalFeed`).
- Verify: web build; components render with loading/empty states.
- Files: `components/dashboard/*.tsx`.

#### Task 11: assemble single-screen page
- Acceptance: `app/page.tsx` is the no-scroll dashboard composing the four
  components; old 4-stat/3-column layout removed.
- Verify: web build; manual — `/` fits 1440×900 with no scroll, zoom + live
  feed work end-to-end.
- Files: `app/page.tsx`.

#### Checkpoint C — Complete
- [ ] `pnpm build` + `pnpm test` green; success criteria in the spec met;
      human review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM narration cost creeps up | Med | Fixed 6h cadence; roll-ups summarize summaries, not raw trades |
| Narration generation blocks a trading cycle | Med | Separate cron, off the trading loop (spec boundary) |
| SSE connection drops silently | Low | `EventSource` auto-reconnects; React Query polling stays as a fallback floor |
| Single-screen layout breaks on small viewports | Low | Target 1440×900; accept scroll below a breakpoint |
| Backfill spends a burst of LLM tokens | Med | One-off, idempotent, run manually & observed |

## Open Questions

None — the three spec questions are resolved (6h finest, backfill history,
last-N + stream feed).
