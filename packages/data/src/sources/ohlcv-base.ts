import type { Candle } from '@trader/shared'

export interface OhlcvSource {
  readonly id: string
  fetchOhlcv(
    coins: string[],
    timeframe: string,
    limit: number,
  ): Promise<Record<string, Candle[]>>
}
