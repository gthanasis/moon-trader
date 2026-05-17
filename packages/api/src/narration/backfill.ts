import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import { PrismaClient } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'
import { TradeRepository } from '../prisma/repositories/trade.repository'
import { DecisionRepository } from '../prisma/repositories/decision.repository'
import { NarrationRepository } from '../prisma/repositories/narration.repository'
import { CandleRepository } from '../prisma/repositories/candle.repository'
import { LessonRepository } from '../prisma/repositories/lesson.repository'
import { NarrationLlmService } from './narration-llm.service'
import { NarrationService } from './narration.service'
import {
  floorTo6h, floorToDay, floorToWeek, floorToMonth, periodEndOf,
  SIX_HOURS_MS, DAY_MS, WEEK_MS,
} from './narration-periods'

// One-off: generates the full narration hierarchy for all existing trades.
// Idempotent — safe to re-run (upsert keyed on granularity+periodStart).
//   pnpm --filter @trader/api exec tsx src/narration/backfill.ts
loadDotenv({ path: resolve(process.cwd(), '../../.env') })

const prisma = new PrismaClient() as unknown as PrismaService
const narration = new NarrationService(
  new TradeRepository(prisma),
  new DecisionRepository(prisma),
  new NarrationRepository(prisma),
  new NarrationLlmService(),
  new CandleRepository(prisma),
  new LessonRepository(prisma),
)

async function main(): Promise<void> {
  const first = await prisma.trade.findFirst({
    orderBy: { openedAt: 'asc' },
    select: { openedAt: true },
  })
  if (!first) {
    console.log('No trades found — nothing to backfill.')
    return
  }

  const start = first.openedAt
  const now = Date.now()
  console.log(`Backfilling narrations from ${start.toISOString()} to now.`)

  // Bottom-up: 6h blocks first, then each roll-up level summarises the last.
  console.log('6h blocks…')
  for (let t = floorTo6h(start).getTime(); t < now; t += SIX_HOURS_MS) {
    await narration.generateBlock(new Date(t))
  }

  console.log('daily roll-ups…')
  for (let t = floorToDay(start).getTime(); t < now; t += DAY_MS) {
    await narration.generateRollup('day', new Date(t))
  }

  console.log('weekly roll-ups…')
  for (let t = floorToWeek(start).getTime(); t < now; t += WEEK_MS) {
    await narration.generateRollup('week', new Date(t))
  }

  console.log('monthly roll-ups…')
  for (let m = floorToMonth(start); m.getTime() < now; m = periodEndOf('month', m)) {
    await narration.generateRollup('month', m)
  }

  console.log('Backfill complete.')
}

main()
  .catch(err => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
