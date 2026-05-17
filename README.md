# moon-trader

An LLM-driven crypto trading bot. It pulls market and sentiment data on a
schedule, asks a language model for a trade decision, runs that decision
through hard-coded risk controls, and either executes it or asks you to
approve it. It ships with a backtesting engine, a Next.js dashboard, and an
optional Telegram bot.

> ## ⚠️ Disclaimer — Use at Your Own Risk
>
> This software is provided for **educational and research purposes only**. It
> is **not financial advice**. Cryptocurrency trading carries substantial risk
> of loss — you can lose some or all of your capital. The authors and
> contributors make **no warranty** as to the correctness, reliability, or
> profitability of this software and accept **no liability** for any financial
> losses, missed trades, exchange errors, or damages of any kind arising from
> its use. You are solely responsible for your own trading decisions, for
> securing your exchange API keys, and for complying with the laws and tax
> obligations of your jurisdiction. **Always run with `PAPER=true` until you
> fully understand the system.** By using this software you accept all risk.

## Features

- **LLM trade evaluation** — decisions from OpenAI or Anthropic models, with
  confidence calibration, an adversarial critic, and a lessons ledger.
- **Risk management** — per-trade risk sizing, a daily loss limit, a max-open-
  positions cap, a minimum-confidence gate, and an auto-trade size threshold
  above which a trade needs human approval.
- **Exits** — trailing stops, tiered take-profit, and partial take-profit.
- **Backtesting** — replay historical candles with fill simulation, slippage,
  and fees; runs are persisted and streamed to the dashboard.
- **Web dashboard** — Next.js UI for positions, trades, signals, decisions,
  narration, and settings.
- **Telegram bot** — optional `/pause` `/resume` `/status` `/capital` commands
  and inline approve/reject prompts for trades that exceed the auto threshold.
- **Paper trading** — `PAPER=true` simulates fills so you can run the whole
  system without touching a real exchange.

## Architecture

A pnpm + Turborepo monorepo:

| Package        | Stack                | Responsibility |
|----------------|----------------------|----------------|
| `packages/api` | NestJS               | Trading loop, LLM evaluation, backtesting, persistence, Telegram bot, HTTP API |
| `packages/web` | Next.js, React Query | Dashboard UI |

Inside `packages/api/src`:

- `core/` — pure, dependency-free trading logic (capital guard, position
  tracker, order manager, trading engine).
- `trading/` — the live NestJS wiring around `core/` (scheduler, data loader,
  cycle runner).
- `llm/` — provider clients and the evaluation cycle.
- `backtest/` — historical replay and fill simulation.
- `http/` — REST controllers consumed by the dashboard.
- `telegram/` — bot lifecycle, commands, trade-approval prompts.

State is persisted to PostgreSQL via Prisma.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) 10+
- Docker (for the local PostgreSQL instance)

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in your keys — see Configuration below
```

`pnpm dev` runs `docker compose up -d --wait` first (via the `predev` script),
which starts PostgreSQL. Apply the database schema:

```bash
pnpm --filter @trader/api db:generate
pnpm --filter @trader/api exec prisma migrate deploy
```

## Running

```bash
pnpm dev
```

This starts the API and the web dashboard via Turborepo. By default:

- API — `http://127.0.0.1:4000` (loopback only)
- Web — `http://localhost:3000`

## Configuration

All configuration is via `.env` (see `.env.example` for the full list).
Key variables:

| Variable             | Purpose |
|----------------------|---------|
| `PAPER`              | `true` simulates fills; `false` places real orders. **Keep `true` until you are sure.** |
| `BINANCE_API_KEY` / `BINANCE_SECRET` | Exchange credentials (only needed for live trading). |
| `LLM_PROVIDER`       | `openai` or `anthropic`. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | LLM credentials. |
| `DATABASE_URL`       | PostgreSQL connection string. |
| `TOTAL_CAPITAL`      | Capital the bot manages. |
| `AUTO_TRADE_LIMIT`   | Trades at or below this size execute automatically; larger ones need approval. |
| `API_AUTH_TOKEN`     | Optional. Required bearer token for state-changing API routes — see Security. |
| `WEB_ORIGIN`         | Allowed CORS origin for the API (default `http://localhost:3000`). |

## Paper vs. live trading

The bot defaults to paper trading. Before going live:

1. Run with `PAPER=true` long enough to trust the behaviour.
2. Create exchange API keys with **trade-only permissions and no withdrawal
   access**, and restrict them to your server's IP.
3. Set `PAPER=false` and start with capital you can afford to lose.

## Testing

```bash
pnpm test        # run the vitest suite
pnpm typecheck   # type-check all packages
```

## Security

The API binds to `127.0.0.1` only and has no authentication by default — this
is safe for a local single-machine setup. **Do not expose it beyond loopback
without setting `API_AUTH_TOKEN`.** See [SECURITY.md](SECURITY.md) for details
and for how to report vulnerabilities.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Thanasis Gliatis
