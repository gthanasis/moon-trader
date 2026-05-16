import { Injectable } from '@nestjs/common'
import type { Trade } from '../../common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class TradeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveTrade(trade: Trade, source: string = 'live'): Promise<void> {
    await this.prisma.trade.create({
      data: {
        id: trade.id,
        coin: trade.coin,
        side: trade.side,
        size: trade.size,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice ?? null,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt ?? null,
        pnl: trade.pnl ?? null,
        reasoning: trade.reasoning ?? null,
        source,
      },
    })
  }

  async findRecentTrades(limit: number): Promise<Trade[]> {
    const rows = await this.prisma.trade.findMany({
      take: limit,
      orderBy: { openedAt: 'desc' },
    })
    return rows.map(toDomainTrade)
  }

  async findOpenTrades(): Promise<Trade[]> {
    const rows = await this.prisma.trade.findMany({
      where: { closedAt: null },
      orderBy: { openedAt: 'desc' },
    })
    return rows.map(toDomainTrade)
  }

  /** Trades whose `closedAt` falls in [from, to) — used for period narration. */
  async findClosedBetween(from: Date, to: Date): Promise<Trade[]> {
    const rows = await this.prisma.trade.findMany({
      where: { closedAt: { gte: from, lt: to } },
      orderBy: { closedAt: 'asc' },
    })
    return rows.map(toDomainTrade)
  }

  async findOpenTradeByCoin(coin: string): Promise<Trade | null> {
    const row = await this.prisma.trade.findFirst({
      where: { coin, closedAt: null },
      orderBy: { openedAt: 'desc' },
    })
    return row ? toDomainTrade(row) : null
  }

  async closeTrade(id: string, data: { exitPrice: number; closedAt: Date; pnl: number }): Promise<void> {
    await this.prisma.trade.update({
      where: { id },
      data: { exitPrice: data.exitPrice, closedAt: data.closedAt, pnl: data.pnl },
    })
  }
}

function toDomainTrade(row: {
  id: string; coin: string; side: string; size: number; entryPrice: number
  exitPrice: number | null; openedAt: Date; closedAt: Date | null
  pnl: number | null; reasoning: string | null
}): Trade {
  return {
    id: row.id, coin: row.coin, side: row.side as Trade['side'],
    size: row.size, entryPrice: row.entryPrice,
    exitPrice: row.exitPrice ?? undefined, openedAt: row.openedAt,
    closedAt: row.closedAt ?? undefined, pnl: row.pnl ?? undefined,
    reasoning: row.reasoning ?? undefined,
  }
}
