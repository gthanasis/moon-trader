import type { Signal, Candle, WorldSnapshot } from '@trader/shared'

export function historicalSlice(
  allSignals: Signal[],
  ohlcv: Record<string, Candle[]>,
  currentTime: Date,
): WorldSnapshot {
  const cutoff = currentTime.getTime()

  const signals = allSignals.filter(s => s.timestamp.getTime() <= cutoff)

  const slicedOhlcv: Record<string, Candle[]> = {}
  for (const [coin, candles] of Object.entries(ohlcv)) {
    slicedOhlcv[coin] = candles.filter(c => c.timestamp.getTime() < cutoff)
  }

  return { timestamp: currentTime, signals, ohlcv: slicedOhlcv }
}
