# Implementation Plan: Backtest Run Persistence & History UI

## Overview
Five sequential phases: schema → repository → SSE route update → API routes →
web UI. Each phase leaves the system working. Tasks 1–2 can run in parallel;
everything else is sequential.

## Dependency Graph
```
Prisma schema migration (Task 1)
    └── BacktestRunRepository (Task 2)
            └── SSE route update (Task 3)
                    └── API routes (Task 4)
                            └── Web pages + client link (Task 5)
```
Tasks 1 & 2 are independent of each other and can be parallelised.

---

## Phase 1: Foundation (Tasks 1 & 2 — parallelisable)

### Task 1: Prisma schema — add `BacktestRun` model
**Description:** Add the `BacktestRun` model to `packages/db/prisma/schema.prisma`
and run `prisma migrate dev` to apply it.

**Acceptance criteria:**
- [ ] `BacktestRun` model exists with all fields from the spec
- [ ] Migration file generated and applied to local DB
- [ ] `@prisma/client` regenerated — `prisma.backtestRun` is available

**Verification:** `pnpm --filter @trader/db typecheck`; verify table exists in DB
with `psql` or `prisma studio`

**Dependencies:** None

**Files:**
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/<timestamp>_add_backtest_run/` (generated)

**Size:** XS

---

### Task 2: `BacktestRunRepository`
**Description:** New repository class exposing `create`, `complete`, `fail`,
`findAll`, `findById`. `create` inserts a row with `status='running'` and returns
the generated `id`. `complete` writes stats/trades/pnlCurve/decisions and flips
status. `fail` writes errorMessage and flips status. `findAll(limit=50)` returns
summary rows (no trades/pnlCurve/decisions). `findById` returns the full row.

Export the class and a singleton instance from `packages/db/src/index.ts`.

**Acceptance criteria:**
- [ ] All five methods implemented and correctly typed
- [ ] `findAll` excludes `trades`, `pnlCurve`, `decisions` fields (select)
- [ ] Singleton `backtestRunRepository` exported from `@trader/db`
- [ ] Unit tests: `create` returns string id; `complete` calls prisma update with
  correct fields; `fail` sets status=error

**Verification:** `pnpm test`, `pnpm --filter @trader/db typecheck`

**Dependencies:** Task 1 (needs generated Prisma client)

**Files:**
- `packages/db/src/repositories/backtest-run-repository.ts` (new)
- `packages/db/src/index.ts`
- `packages/db/tests/backtest-run-repository.test.ts` (new)

**Size:** M

---

### Checkpoint A
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` no new failures
- [ ] `backtestRunRepository` importable from `@trader/db`

---

## Phase 2: SSE route update (Task 3)

### Task 3: Wire persistence into `/api/backtest/stream`
**Description:** Update `packages/web/app/api/backtest/stream/route.ts` to:
1. Call `backtestRunRepository.create(config)` at the start, get back `runId`
2. Emit `{ type: 'run_created', runId }` as the very first SSE event
3. Accumulate decisions in a local array during the run (each `onStep` callback
   appends `{ timestamp, action, coin, size, confidence, reasoning }`)
4. On completion: call `backtestRunRepository.complete(runId, result, decisions)`
5. On error: call `backtestRunRepository.fail(runId, message)`

**Acceptance criteria:**
- [ ] First SSE event is always `{ type: 'run_created', runId }`
- [ ] DB row exists with `status='running'` immediately after stream opens
- [ ] After successful run: row has `status='done'`, stats/trades/pnlCurve/decisions populated
- [ ] After error: row has `status='error'`, errorMessage populated
- [ ] Decisions array in DB has one entry per step

**Verification:** `pnpm --filter @trader/web typecheck`; manual: run a short
backtest, check DB row via `prisma studio` or psql

**Dependencies:** Task 2

**Files:**
- `packages/web/app/api/backtest/stream/route.ts`

**Size:** S

---

### Task 4: Client receives `runId`, shows "View run →" link
**Description:** In `backtest-client.tsx`, handle the new `run_created` SSE event
type — store `runId` in state. When status transitions to `done`, render a link:
`"View saved run → /backtest/runs/{runId}"` below the progress bar.

Also add `RunCreatedEvent` to the `SseEvent` union type.

**Acceptance criteria:**
- [ ] `runId` captured from first SSE event
- [ ] After run completes, a link to `/backtest/runs/{runId}` appears
- [ ] Link opens in same tab (no `target="_blank"`)
- [ ] No visual change during the run itself

**Verification:** `pnpm --filter @trader/web typecheck`; manual: complete a run,
verify link appears and navigates correctly

**Dependencies:** Task 3

**Files:**
- `packages/web/app/backtest/backtest-client.tsx`

**Size:** XS

---

### Checkpoint B
- [ ] End-to-end: run a backtest, DB row appears, link shows after completion
- [ ] `pnpm typecheck` clean

---

## Phase 3: API routes (Task 5)

### Task 5: `GET /api/backtest/runs` and `GET /api/backtest/runs/[id]`
**Description:** Two new Next.js route handlers.

`/api/backtest/runs`:
- Calls `backtestRunRepository.findAll(50)`
- Returns JSON array of summary objects
- Formats dates as ISO strings

`/api/backtest/runs/[id]`:
- Calls `backtestRunRepository.findById(id)`
- Returns 404 JSON if not found
- Returns full run detail including decisions

**Acceptance criteria:**
- [ ] `GET /api/backtest/runs` returns array, newest first
- [ ] `GET /api/backtest/runs/[id]` returns full run or 404
- [ ] Both routes handle DB errors gracefully (500 response)

**Verification:** `pnpm --filter @trader/web typecheck`; manual: curl the endpoints

**Dependencies:** Task 2

**Files:**
- `packages/web/app/api/backtest/runs/route.ts` (new)
- `packages/web/app/api/backtest/runs/[id]/route.ts` (new)

**Size:** S

---

### Checkpoint C
- [ ] API routes return correct data
- [ ] 404 on unknown ID

---

## Phase 4: Web UI (Task 6)

### Task 6: `/backtest/runs` list page + `/backtest/runs/[id]` detail page
**Description:** Two new server-component pages.

**List page** (`/backtest/runs/page.tsx`):
- Fetches from `/api/backtest/runs` (or calls repo directly since it's server)
- Renders a table: ID (truncated, 8 chars), created date, range, model, interval,
  status badge, P&L (from stats.totalPnl, `—` if no stats yet)
- Each row links to `/backtest/runs/[id]`
- Add "Backtest Runs" link to the nav if one exists

**Detail page** (`/backtest/runs/[id]/page.tsx`):
- Fetches run by ID; shows 404 message if not found
- Header: run ID, date range, model, interval, created at
- Reuses `BacktestResults` component for stats + chart (extracted/shared)
- Shows decision feed below (reuses the same `DecisionFeed` component or
  similar inline render — decisions from DB, not live stream)
- Shows error message if status=`error`

**Acceptance criteria:**
- [ ] `/backtest/runs` lists runs, newest first, correct P&L shown
- [ ] Clicking a row navigates to detail page
- [ ] Detail page shows stats, chart, and all decisions
- [ ] Detail page handles missing run gracefully
- [ ] Error runs show errorMessage instead of stats

**Verification:** `pnpm --filter @trader/web typecheck`; manual: navigate both pages

**Dependencies:** Tasks 4, 5

**Files:**
- `packages/web/app/backtest/runs/page.tsx` (new)
- `packages/web/app/backtest/runs/[id]/page.tsx` (new)
- `packages/web/components/backtest-results.tsx` (extract from backtest-client.tsx)
- `packages/web/app/backtest/backtest-client.tsx` (import extracted component)

**Size:** M

---

### Checkpoint D — Full acceptance
- [ ] `pnpm typecheck` clean across all packages
- [ ] `pnpm test` — no new failures
- [ ] End-to-end: run a backtest → see link → navigate to run list → click run →
  see full detail including decisions

---

## Parallelisation
- Tasks 1 & 2 can run simultaneously (different files, no shared state)
- Tasks 3, 4, 5 can run in parallel after Tasks 1 & 2 complete (3 touches the
  stream route, 4 touches the client, 5 adds new routes — no conflicts)
- Task 6 must be last (needs routes from 5 and shared component from 4)

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Large decisions JSON (2,880 objects × ~200 bytes = ~580KB) | Low | Postgres JSONB handles this fine; no pagination needed |
| Migration on running DB | Low | `prisma migrate dev` is safe for additive changes |
| BacktestResults component extraction breaks existing UI | Low | Extract to shared component, import in both places |
