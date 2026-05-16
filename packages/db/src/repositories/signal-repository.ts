import type { Signal } from '@trader/shared'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

export class SignalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveSignals(signals: Signal[]): Promise<void> {
    if (signals.length === 0) return
    await this.prisma.signal.createMany({
      data: signals.map(s => ({
        source: s.source, type: s.type, content: s.content,
        timestamp: s.timestamp, coins: s.coins ?? [],
        raw: s.raw !== undefined ? (s.raw as Prisma.InputJsonValue) : Prisma.DbNull,
      })),
      skipDuplicates: true,
    })
  }

  async findSignalsSince(from: Date): Promise<Signal[]> {
    const rows = await this.prisma.signal.findMany({
      where: { timestamp: { gte: from } },
      orderBy: { timestamp: 'desc' },
    })
    return rows.map(r => ({
      source: r.source, type: r.type as Signal['type'], content: r.content,
      timestamp: r.timestamp, coins: r.coins.length > 0 ? r.coins : undefined,
      raw: r.raw ?? undefined,
    }))
  }

  async findSignals(from: Date, to: Date): Promise<Signal[]> {
    const rows = await this.prisma.signal.findMany({
      where: { timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: 'desc' },
    })
    return rows.map(r => ({
      source: r.source, type: r.type as Signal['type'], content: r.content,
      timestamp: r.timestamp, coins: r.coins.length > 0 ? r.coins : undefined,
      raw: r.raw ?? undefined,
    }))
  }
}
