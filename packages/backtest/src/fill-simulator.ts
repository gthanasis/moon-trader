import type { Candle } from '@trader/shared'

export function getFillPrice(candles: Candle[], afterTime: Date, expectedIntervalMs: number = 60 * 60 * 1000): number | undefined {
  const cutoff = afterTime.getTime()
  const next = candles.find(c => c.timestamp.getTime() > cutoff)
  if (!next) return undefined
  if (next.timestamp.getTime() - cutoff > 2 * expectedIntervalMs) return undefined
  return next.open
}
