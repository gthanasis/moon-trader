import type { Trade } from '@trader/shared'
import type { PrismaClient } from '@prisma/client'

export class TradeRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
