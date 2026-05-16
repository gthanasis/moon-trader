import type { Signal, Candle, WorldSnapshot } from '../common'

// Returns the first index where arr[i].timestamp >= cutoff (upper-bound binary search).
// Assumes arr is sorted ascending by timestamp. Used to slice without O(n) filter.
function upperBound(arr: { timestamp: Date }[], cutoff: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].timestamp.getTime() < cutoff) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function historicalSlice(
  allSignals: Signal[],
  ohlcv: Record<string, Candle[]>,
  currentTime: Date,
): WorldSnapshot {
  const cutoff = currentTime.getTime()

  // Strict < to prevent look-ahead bias (signals published at currentTime are future data).
  const signals = allSignals.slice(0, upperBound(allSignals, cutoff))

  const slicedOhlcv: Record<string, Candle[]> = {}
  for (const [coin, candles] of Object.entries(ohlcv)) {
    slicedOhlcv[coin] = candles.slice(0, upperBound(candles, cutoff))
  }

  return { timestamp: currentTime, signals, ohlcv: slicedOhlcv }
}
