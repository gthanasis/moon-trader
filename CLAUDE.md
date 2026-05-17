# Agent instructions

Guidance for Claude Code and other coding agents working in this repository.
Human contributors should read [CONTRIBUTING.md](CONTRIBUTING.md).

## Branching — required

**Never commit directly to `main`.** All changes — however small — land through
a pull request from a feature branch.

1. Branch from an up-to-date `main`: `git checkout main && git pull && git checkout -b <type>/<short-description>` (e.g. `feat/partial-exits`, `fix/stop-loss-fill`, `docs/pr-workflow`).
2. Commit to that branch.
3. Push it and open a PR: `git push -u origin <branch>` then `gh pr create`.
4. Merge only after CI is green.

Do not push to `main`. Do not force-push shared branches.

## Project overview

`moon-trader` is an LLM-driven crypto trading bot. A pnpm + Turborepo monorepo:

- `packages/api` — NestJS: trading loop, LLM evaluation, backtesting,
  persistence (Prisma/PostgreSQL), Telegram bot, HTTP API.
- `packages/web` — Next.js dashboard.

Inside `packages/api/src`: `core/` is pure, framework-free trading logic;
`trading/` wires it into NestJS; `llm/`, `backtest/`, `http/`, `telegram/` are
the remaining feature areas.

## Commands

```bash
pnpm install
pnpm --filter @trader/api db:generate   # generate the Prisma client
pnpm dev          # api + web (starts PostgreSQL via docker compose)
pnpm test         # vitest
pnpm typecheck    # type-check all packages
pnpm build
```

Before opening a PR, `pnpm typecheck`, `pnpm test`, and `pnpm build` must pass —
CI runs all three.

## Conventions

- Match the style of the surrounding code. Keep `core/` free of framework
  dependencies.
- Money-handling and risk logic must be covered by tests.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org).
- Never commit `.env`, real API keys, or screenshots of real-account data.
- Tests must be hermetic — do not depend on ambient environment variables.

## Security

The API binds to `127.0.0.1` and its mutating routes are unauthenticated by
default (loopback-only). If anything changes the network exposure or auth
model, update [SECURITY.md](SECURITY.md) in the same PR.
