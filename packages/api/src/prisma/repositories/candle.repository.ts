import { Injectable } from '@nestjs/common'
import type { Candle } from '../../common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class CandleRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Buy-and-hold % return for a coin between the first and last candle in
   * [from, to), across any timeframe. Returns null when there is too little
   * data to measure — used as the narration benchmark.
   */
  async priceReturn(coin: string, from: Date, to: Date): Promise<number | null> {
    const where = { coin, timestamp: { gte: from, lt: to } }
    const [first, last] = await Promise.all([
      this.prisma.candle.findFirst({ where, orderBy: { timestamp: 'asc' } }),
      this.prisma.candle.findFirst({ where, orderBy: { timestamp: 'desc' } }),
    ])
    if (!first || !last || first.close <= 0) return null
    return ((last.close - first.close) / first.close) * 100
  }

  async findCandles(coin: string, timeframe: string, from: Date, to: Date, limit = 200_000): Promise<Candle[]> {
    const rows = await this.prisma.candle.findMany({
      where: { coin, timeframe, timestamp: { gte: from, lt: to } },
      orderBy: { timestamp: 'asc' },
      take: limit + 1,
    })
    if (rows.length > limit) {
      throw new Error(`findCandles: ${coin}/${timeframe} exceeds ${limit} row limit — narrow the date range or use a larger interval`)
    }
    return rows.map(r => ({
      timestamp: r.timestamp, open: r.open, high: r.high,
      low: r.low, close: r.close, volume: r.volume,
    }))
  }
}
