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

function timeframeToMs(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
  }
  const ms = map[timeframe]
  if (ms === undefined) throw new Error(`Unsupported timeframe: ${timeframe}`)
  return ms
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

  async fetchHistoricalOhlcv(
    coins: string[],
    timeframe: string,
    from: Date,
    to: Date,
  ): Promise<Record<string, Candle[]>> {
    const limit = 1000
    const intervalMs = timeframeToMs(timeframe)
    const toMs = to.getTime()

    const results = await Promise.allSettled(
      coins.map(async coin => {
        const candles: Candle[] = []
        let since = from.getTime()

        while (since <= toMs) {
          const rows = await this.exchange.fetchOHLCV(coin, timeframe, since, limit)
          if (rows.length === 0) break
          for (const r of rows) {
            const ts = new Date(r[0])
            if (ts <= to) {
              candles.push({ timestamp: ts, open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] })
            }
          }
          since += limit * intervalMs
          if (rows.length < limit) break
        }

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
