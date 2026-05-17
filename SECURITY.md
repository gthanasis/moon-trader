# Security Policy

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public issue for a
vulnerability.

- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  ("Report a vulnerability" under the Security tab), or
- email the maintainer.

Please include steps to reproduce and the potential impact. We aim to
acknowledge reports within a few days.

## Operating this software safely

This is a trading bot that can move real money. Treat its deployment as
security-sensitive.

### Secrets

- Never commit `.env`. It is gitignored — keep it that way.
- If a key is ever exposed, **rotate it immediately** on the exchange / LLM
  provider.
- Create exchange API keys with **trade-only permissions and no withdrawal
  access**, and restrict them to your server's IP address.

### Network exposure

- The API binds to `127.0.0.1` only. This loopback bind is its primary
  security boundary.
- By default the state-changing HTTP routes (`PUT /bot/paused`,
  `PUT /settings`, `PATCH /decisions/:id`, `POST /backtest/runs`) are
  **unauthenticated** — acceptable only because they are loopback-only.
- If you expose the API beyond loopback (reverse proxy, container port
  mapping, LAN), you **must** set `API_AUTH_TOKEN` in `.env`. When set, every
  mutating request must carry `Authorization: Bearer <token>`. Configure the
  dashboard with the matching `NEXT_PUBLIC_API_TOKEN`.
- CORS is restricted to `WEB_ORIGIN` (default `http://localhost:3000`). Do not
  widen it to `*`.

### Telegram

- The bot only accepts commands and trade approvals from the chat configured
  via `TELEGRAM_CHAT_ID`. Messages from any other chat are ignored.
- Do not add the bot to shared/group chats.

### Before going live

- Run with `PAPER=true` until you trust the system.
- Keep dependencies patched: run `pnpm audit` periodically.
