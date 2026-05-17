import { Injectable } from '@nestjs/common'
import {
  type Narration,
  type NarrationGranularity,
  type NarrationStats,
  CHILD_GRANULARITY,
} from '../../common'
import { PrismaService } from '../prisma.service'

/** A narration without its generated `id`/`createdAt` — the upsert input. */
export interface NarrationInput {
  granularity: NarrationGranularity
  periodStart: Date
  periodEnd: Date
  summary: string
  assessment: string | null
  stats: NarrationStats
}

type NarrationRow = {
  id: string
  granularity: string
  periodStart: Date
  periodEnd: Date
  summary: string
  assessment: string | null
  stats: unknown
  createdAt: Date
}

function toDomain(row: NarrationRow): Narration {
  return {
    id: row.id,
    granularity: row.granularity as NarrationGranularity,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    summary: row.summary,
    assessment: row.assessment,
    stats: row.stats as NarrationStats,
    createdAt: row.createdAt,
  }
}

@Injectable()
export class NarrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserts or replaces the narration for a (granularity, periodStart) slot. */
  async upsert(n: NarrationInput): Promise<void> {
    const data = {
      granularity: n.granularity,
      periodStart: n.periodStart,
      periodEnd: n.periodEnd,
      summary: n.summary,
      assessment: n.assessment,
      stats: n.stats as object,
    }
    await this.prisma.narration.upsert({
      where: { granularity_periodStart: { granularity: n.granularity, periodStart: n.periodStart } },
      create: data,
      update: data,
    })
  }

  /** Narrations of one granularity whose period starts within [from, to). */
  async find(granularity: NarrationGranularity, from: Date, to: Date): Promise<Narration[]> {
    const rows = await this.prisma.narration.findMany({
      where: { granularity, periodStart: { gte: from, lt: to } },
      orderBy: { periodStart: 'asc' },
    })
    return rows.map(toDomain)
  }

  /** The most recent narration of one granularity, if any. */
  async findLatest(granularity: NarrationGranularity): Promise<Narration | null> {
    const row = await this.prisma.narration.findFirst({
      where: { granularity },
      orderBy: { periodStart: 'desc' },
    })
    return row ? toDomain(row) : null
  }

  /** The single narration for an exact (granularity, periodStart) slot, if any. */
  async findOne(granularity: NarrationGranularity, periodStart: Date): Promise<Narration | null> {
    const row = await this.prisma.narration.findUnique({
      where: { granularity_periodStart: { granularity, periodStart } },
    })
    return row ? toDomain(row) : null
  }

  /**
   * The finer-granularity narrations that fall inside a parent period — e.g.
   * the `6h` narrations within a `day`. Empty when the parent is finest (`6h`).
   */
  async findChildren(
    parentGranularity: NarrationGranularity,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Narration[]> {
    const child = CHILD_GRANULARITY[parentGranularity]
    if (!child) return []
    const rows = await this.prisma.narration.findMany({
      where: { granularity: child, periodStart: { gte: periodStart, lt: periodEnd } },
      orderBy: { periodStart: 'asc' },
    })
    return rows.map(toDomain)
  }
}
