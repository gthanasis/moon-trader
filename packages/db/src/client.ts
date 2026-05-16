import { PrismaClient } from '@prisma/client'

// In dev, Next.js HMR re-evaluates modules on each reload, creating new PrismaClient
// instances without closing old ones. Storing on globalThis survives HMR so we reuse
// the same client (and its connection pool) across reloads.
const g = globalThis as typeof globalThis & { _prisma?: PrismaClient }

export function getPrismaClient(): PrismaClient {
  if (!g._prisma) {
    g._prisma = new PrismaClient()
  }
  return g._prisma
}

export type { PrismaClient }
