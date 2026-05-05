import type { Candle } from '@trader/shared'
import type { PrismaClient } from '@prisma/client'

export class CandleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveCandles(coin: string, timeframe: string, candles: Candle[]): Promise<void> {
    if (candles.length === 0) return
    await this.prisma.candle.createMany({
      data: candles.map(c => ({
        coin, timeframe, timestamp: c.timestamp,
        open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      })),
      skipDuplicates: true,
    })
  }

  async findCandles(coin: string, timeframe: string, from: Date, to: Date): Promise<Candle[]> {
    const rows = await this.prisma.candle.findMany({
      where: { coin, timeframe, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: 'asc' },
    })
    return rows.map(r => ({
      timestamp: r.timestamp, open: r.open, high: r.high,
      low: r.low, close: r.close, volume: r.volume,
    }))
  }
}
