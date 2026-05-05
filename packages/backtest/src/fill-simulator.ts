import type { Candle } from '@trader/shared'

export function getFillPrice(candles: Candle[], afterTime: Date): number | undefined {
  const cutoff = afterTime.getTime()
  const next = candles.find(c => c.timestamp.getTime() > cutoff)
  return next?.open
}
