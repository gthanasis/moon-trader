# TODO: Home Dashboard + Hierarchical Narration

Plan: `tasks/dashboard-plan.md` · Spec: `docs/superpowers/specs/2026-05-16-home-dashboard-narration-design.md`

## Phase 1 — Narration backend
- [x] Task 1: Narration model + repository
- [x] Task 2: NarrationService — 6h generation
- [x] Task 3: Roll-up generation (day/week/month)
- [ ] Task 4: Cron wiring
- [ ] Task 5: GET /narrations
- [ ] Task 6: Backfill script
- [ ] **Checkpoint A** — narration backend green, human review

## Phase 2 — Real-time events
- [ ] Task 7: EventsService + SSE /events
- [ ] Task 8: Emit events from the trading loop
- [ ] **Checkpoint B** — /events pushes live

## Phase 3 — Web dashboard
- [ ] Task 9: web data layer (api-client, useNarrations, useAppEvents)
- [ ] Task 10: dashboard components (PnlHero, NarrationPanel, LiveActivityFeed, SignalsSummary)
- [ ] Task 11: assemble single-screen page.tsx
- [ ] **Checkpoint C** — complete, human review
