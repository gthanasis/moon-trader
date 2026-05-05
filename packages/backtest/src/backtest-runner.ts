import type { Signal, TradingContext } from '@trader/shared'
import { historicalSlice } from './historical-slice.js'
import { getFillPrice } from './fill-simulator.js'
import { calculateStats } from './stats-calculator.js'
import type { BacktestConfig, BacktestResult, BacktestTrade, PnlPoint } from './types.js'

interface OpenPosition {
  trade: BacktestTrade
}

export class BacktestRunner {
  constructor(private readonly config: BacktestConfig) {}

  async run(): Promise<BacktestResult> {
    const { from, to, initialCapital, sources, ohlcv, adapter } = this.config
    const intervalMs = this.config.intervalMs ?? 15 * 60 * 1000

    // fetch all historical signals upfront
    const allSignals: Signal[] = []
    const sourceResults = await Promise.allSettled(
      sources.map(async source => {
        const signals = await source.fetchHistorical(from, to)
        allSignals.push(...signals)
      }),
    )
    for (const result of sourceResults) {
      if (result.status === 'rejected') {
        console.warn('[BacktestRunner] Signal source failed:', result.reason)
      }
    }

    const trades: BacktestTrade[] = []
    const pnlCurve: PnlPoint[] = []
    const openPositions: OpenPosition[] = []
    let capital = initialCapital

    let current = from.getTime()
    const end = to.getTime()

    while (current < end) {
      const currentTime = new Date(current)
      const snapshot = historicalSlice(allSignals, ohlcv, currentTime)

      const closedTrades = trades.filter(t => t.closedAt !== undefined)

      const context: TradingContext = {
        snapshot,
        positions: openPositions.map(p => ({
          coin: p.trade.coin,
          size: p.trade.size,
          entryPrice: p.trade.entryPrice,
          currentPrice:
            [...(ohlcv[p.trade.coin] ?? [])].reverse().find(c => c.timestamp.getTime() <= current)?.close ??
            p.trade.entryPrice,
          openedAt: p.trade.openedAt,
        })),
        availableCapital: capital,
        recentTrades: closedTrades.slice(-5).map(t => ({
          id: t.openedAt.toISOString() + t.coin,
          coin: t.coin,
          side: t.side,
          size: t.size,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
          pnl: t.pnl,
          reasoning: t.reasoning,
        })),
        openOrders: [],
      }

      const decision = await adapter.decide(context)

      if (decision.action === 'buy' && decision.size > 0 && capital >= decision.size) {
        const fillPrice = getFillPrice(ohlcv[decision.coin] ?? [], currentTime)
        if (fillPrice !== undefined) {
          const trade: BacktestTrade = {
            coin: decision.coin,
            side: 'buy',
            size: decision.size,
            entryPrice: fillPrice,
            openedAt: currentTime,
            reasoning: decision.reasoning,
          }
          capital -= decision.size
          trades.push(trade)
          openPositions.push({ trade })
        }
      } else if (decision.action === 'sell' && decision.size > 0) {
        let posIndex = -1
        for (let i = openPositions.length - 1; i >= 0; i--) {
          if (openPositions[i].trade.coin === decision.coin) { posIndex = i; break }
        }
        if (posIndex !== -1) {
          const fillPrice = getFillPrice(ohlcv[decision.coin] ?? [], currentTime)
          if (fillPrice !== undefined) {
            const pos = openPositions[posIndex]
            const unitsHeld = pos.trade.size / pos.trade.entryPrice
            const proceeds = unitsHeld * fillPrice
            pos.trade.exitPrice = fillPrice
            pos.trade.closedAt = currentTime
            pos.trade.pnl = proceeds - pos.trade.size
            capital += proceeds
            openPositions.splice(posIndex, 1)
          }
        }
      }

      const openPositionValue = openPositions.reduce((sum, p) => {
        const currentPrice =
          [...(ohlcv[p.trade.coin] ?? [])].reverse().find(c => c.timestamp.getTime() <= current)?.close ??
          p.trade.entryPrice
        return sum + (p.trade.size / p.trade.entryPrice) * currentPrice
      }, 0)
      pnlCurve.push({ timestamp: currentTime, capital: capital + openPositionValue })
      current += intervalMs
    }

    // close any remaining open positions at last known price
    for (const pos of openPositions) {
      const lastCandle = ohlcv[pos.trade.coin]?.at(-1)
      if (lastCandle) {
        pos.trade.exitPrice = lastCandle.close
        pos.trade.closedAt = new Date(end)
        const unitsHeld = pos.trade.size / pos.trade.entryPrice
        pos.trade.pnl = unitsHeld * lastCandle.close - pos.trade.size
      }
    }

    const stats = calculateStats(trades, initialCapital, pnlCurve)
    return { trades, stats, pnlCurve }
  }
}
