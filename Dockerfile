# syntax=docker/dockerfile:1
# Multi-stage build for the trader monorepo. The web app imports the API's
# shared types via a tsconfig path alias, so the whole repo is one build
# context. One image runs both processes (api / web) with different commands.

# --- build: install deps, generate the Prisma client, compile api + web ---
FROM node:20-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_* is baked into the web bundle at build time. Default points at
# the API as reached through the SSH tunnel from your browser.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @trader/api exec prisma generate
RUN pnpm --filter @trader/api build
RUN pnpm --filter @trader/web build

# --- runtime: carry the built repo as-is (devDeps kept — prisma CLI is one) ---
FROM node:20-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000 4000
