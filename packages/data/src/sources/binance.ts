import type { Signal, Candle } from '@trader/shared'
import type { DataSource } from './base.js'
import type { OhlcvSource } from './ohlcv-base.js'

type OhlcvRow = [number, number, number, number, number, number]

interface ExchangeLike {
  fetchOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
  ): Promise<OhlcvRow[]>
}

export class BinanceSource implements DataSource, OhlcvSource {
  readonly id = 'binance'

  constructor(private readonly exchange: ExchangeLike) {}

  async fetch(): Promise<Signal[]> {
    return []
  }

  async fetchHistorical(_from: Date, _to: Date): Promise<Signal[]> {
    return []
  }

  async fetchOhlcv(
    coins: string[],
    timeframe: string,
    limit: number,
  ): Promise<Record<string, Candle[]>> {
    const results = await Promise.allSettled(
      coins.map(async coin => {
        const rows = await this.exchange.fetchOHLCV(coin, timeframe, undefined, limit)
        const candles: Candle[] = rows.map(r => ({
          timestamp: new Date(r[0]),
          open: r[1],
          high: r[2],
          low: r[3],
          close: r[4],
          volume: r[5],
        }))
        return [coin, candles] as const
      })
    )

    const ohlcv: Record<string, Candle[]> = {}
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [coin, candles] = result.value
        ohlcv[coin] = candles
      }
    }
    return ohlcv
  }
}
