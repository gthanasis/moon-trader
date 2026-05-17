# Deploying the trader

The stack — Postgres + NestJS API + Next.js web — runs as three containers
from `docker-compose.prod.yml`. Every published port is bound to `127.0.0.1`,
so nothing is exposed to the public internet. You reach the dashboard through
an SSH tunnel.

## On the server (one-time)

```sh
# 1. Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh

# 2. Clone the repo
git clone <repo-url> trader && cd trader

# 3. Configure secrets
cp .env.example .env
#    edit .env — set POSTGRES_PASSWORD, OPENAI_API_KEY (or ANTHROPIC),
#    BINANCE keys, and keep PAPER=true until you have verified it.

# 4. Build and start
docker compose -f docker-compose.prod.yml up -d --build
```

The API runs `prisma migrate deploy` on startup, so the schema is created
automatically on first boot.

## Reaching the dashboard (from your laptop)

Both ports are loopback-only on the server. Forward them over SSH:

```sh
ssh -L 3000:localhost:3000 -L 4000:localhost:4000 <user>@<server>
```

Then open <http://localhost:3000>. The web app's API calls run in your
browser and hit `localhost:4000` through the same tunnel.

## Why this is private

- API and web publish only to `127.0.0.1` on the server — not `0.0.0.0`.
- Postgres has no published port at all; only the API container reaches it.
- The cloud firewall / security list needs **only port 22 open**.
- No nginx server block, no public hostname — from the internet the bot
  does not exist. The SSH tunnel is the sole access path.

For phone access without a tunnel, put the server on Tailscale and browse
the tailnet IP instead — same privacy, no public exposure.

## Updating

```sh
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

## Notes

- `POSTGRES_PASSWORD` is written into the database volume the first time the
  `postgres` container initialises. Changing it later in `.env` will *not*
  update the existing database — you would need to recreate the volume
  (`docker compose -f docker-compose.prod.yml down -v`, which destroys data).
  Pick the password once, before the first `up`.
- `NEXT_PUBLIC_API_URL` is baked into the web bundle at build time and
  defaults to `http://localhost:4000` (correct for the SSH-tunnel setup).
  Override it as a build arg only if you front the API differently.
- The API also supports an `API_AUTH_TOKEN` shared secret for its mutating
  routes — unnecessary with the tunnel-only setup, but available if you ever
  expose it.
