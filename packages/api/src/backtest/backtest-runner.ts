import { randomUUID } from 'crypto'
import { Logger } from '@nestjs/common'
import type { Signal, TradingContext, Candle, Position, Order, Trade } from '../common'
import type { LLMDecision } from '../common'
import { EvaluationCycle } from '../llm'
import type { PipelineLike, EngineLike } from '../llm'
import { historicalSlice } from './historical-slice'
import { getFillPrice } from './fill-simulator'
import { calculateStats } from './stats-calculator'
import type { BacktestConfig, BacktestResult, BacktestTrade, PnlPoint } from './types'

// Binary search: largest candle with timestamp <= timestamp, or undefined.
// Assumes candles are sorted ascending.
function lastCandleAtOrBefore(candles: Candle[], timestamp: number): Candle | undefined {
  let lo = 0, hi = candles.length - 1, result: Candle | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].timestamp.getTime() <= timestamp) {
      result = candles[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

function toTrade(t: BacktestTrade): Trade {
  return {
    id: `${t.openedAt.toISOString()}_${t.coin}`,
    coin: t.coin,
    side: t.side,
    size: t.size,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    pnl: t.pnl,
    reasoning: t.reasoning,
  }
}

/**
 * Wraps historicalSlice as a PipelineLike for EvaluationCycle.
 * Backtest loop sets currentTime before each cycle.run() call.
 */
class HistoricalPipeline implements PipelineLike {
  private currentTime: Date = new Date(0)

  constructor(
    private readonly allSignals: Signal[],
    private readonly ohlcv: Record<string, Candle[]>,
  ) {}

  setTime(t: Date) { this.currentTime = t }

  async fetch() {
    return historicalSlice(this.allSignals, this.ohlcv, this.currentTime)
  }
}

interface SimulatedEngineConfig {
  initialCapital: number
  autoTradeLimit: number
  coins: string[]
  ohlcv: Record<string, Candle[]>
  intervalMs: number
  feeRate: number
  slippageBps: number
  maxPositions: number
  dailyLossLimitPct: number
  maxSinglePositionPct: number
  trailingStopPct: number
}

/**
 * Simulates exchange order execution for backtesting.
 * Implements EngineLike so EvaluationCycle drives the same decision loop as live trading.
 */
class SimulatedEngine implements EngineLike {
  private capital: number
  // Open positions (always side='buy'). Sells close LIFO.
  private openPositions: BacktestTrade[] = []
  private closedTrades: BacktestTrade[] = []
  private readonly highWaterMarks = new Map<string, number>()
  readonly trades: BacktestTrade[] = []
  readonly pnlCurve: PnlPoint[] = []
  private currentTime: Date = new Date(0)
  private dailyStartCapital: number
  private currentUtcDay = -1

  constructor(private readonly cfg: SimulatedEngineConfig) {
    this.capital = cfg.initialCapital
    this.dailyStartCapital = cfg.initialCapital
  }

  setTime(t: Date) { this.currentTime = t }

  private currentEquity(): number {
    const ts = this.currentTime.getTime()
    const openValue = this.openPositions.reduce((sum, p) => {
      const price = lastCandleAtOrBefore(this.cfg.ohlcv[p.coin] ?? [], ts)?.close ?? p.entryPrice
      return sum + (p.size / p.entryPrice) * price
    }, 0)
    return this.capital + openValue
  }

  private refreshDailyReset(): void {
    const day = Math.floor(this.currentTime.getTime() / 86400000)
    if (day !== this.currentUtcDay) {
      this.dailyStartCapital = this.currentEquity()
      this.currentUtcDay = day
    }
  }

  getClosedTrades(): BacktestTrade[] { return this.closedTrades }

  getPositions(): Position[] {
    const ts = this.currentTime.getTime()
    return this.openPositions.map(p => ({
      coin: p.coin,
      size: p.size,
      entryPrice: p.entryPrice,
      currentPrice: lastCandleAtOrBefore(this.cfg.ohlcv[p.coin] ?? [], ts)?.close ?? p.entryPrice,
      openedAt: p.openedAt,
    }))
  }

  getOpenOrders(): Order[] { return [] }

  availableCapital(): number { return this.capital }

  // No-op: SimulatedEngine computes current price live from candles in getPositions().
  updatePositionPrice(_coin: string, _price: number): void {}

  async execute(decision: LLMDecision): Promise<{ executed: boolean; reason?: string; order?: Order }> {
    if (!this.cfg.coins.includes(decision.coin)) {
      return { executed: false, reason: 'unknown coin' }
    }

    if (decision.action === 'buy') {
      if (decision.size <= 0) return { executed: false, reason: 'invalid size' }
      this.refreshDailyReset()
      if (this.openPositions.some(p => p.coin === decision.coin)) {
        return { executed: false, reason: `Position already open for ${decision.coin}` }
      }
      if (this.openPositions.length >= this.cfg.maxPositions) {
        return { executed: false, reason: `Max positions reached (${this.cfg.maxPositions})` }
      }
      const dailyDrawdown = this.dailyStartCapital - this.currentEquity()
      if (dailyDrawdown > this.dailyStartCapital * this.cfg.dailyLossLimitPct) {
        const lossPct = (dailyDrawdown / this.dailyStartCapital * 100).toFixed(1)
        return { executed: false, reason: `Daily loss limit hit: lost ${lossPct}% today` }
      }
      const maxSize = this.capital * this.cfg.maxSinglePositionPct
      if (decision.size > maxSize) {
        return { executed: false, reason: `Size ${decision.size.toFixed(2)} exceeds max single position (${(this.cfg.maxSinglePositionPct * 100).toFixed(0)}% of capital = ${maxSize.toFixed(2)})` }
      }
      if (this.capital < decision.size) return { executed: false, reason: 'insufficient capital' }
      const tradeSize = Math.min(decision.size, this.cfg.autoTradeLimit)
      const rawFill = getFillPrice(this.cfg.ohlcv[decision.coin] ?? [], this.currentTime, this.cfg.intervalMs)
      if (rawFill === undefined) return { executed: false, reason: 'no fill price available' }
      // Buys slip upward (we pay more than the quoted open).
      const fillPrice = rawFill * (1 + this.cfg.slippageBps / 10000)
      const entryFee = tradeSize * this.cfg.feeRate
      const trade: BacktestTrade = {
        coin: decision.coin,
        side: 'buy',
        size: tradeSize,
        entryPrice: fillPrice,
        openedAt: this.currentTime,
        fees: entryFee,
        stopLoss: decision.stopLoss,
        takeProfit: decision.takeProfit,
        reasoning: decision.reasoning,
      }
      this.capital -= tradeSize + entryFee
      this.highWaterMarks.set(decision.coin, fillPrice)
      this.trades.push(trade)
      this.openPositions.push(trade)
      const buyOrder: Order = { id: randomUUID(), coin: decision.coin, side: 'buy', size: tradeSize, createdAt: this.currentTime, status: 'filled', fillPrice, filledAt: this.currentTime }
      return { executed: true, order: buyOrder }
    }

    if (decision.action === 'sell') {
      if (decision.size <= 0) return { executed: false, reason: 'invalid size' }
      // LIFO: close the most recently opened position for this coin.
      let posIndex = -1
      for (let i = this.openPositions.length - 1; i >= 0; i--) {
        if (this.openPositions[i].coin === decision.coin) { posIndex = i; break }
      }
      if (posIndex === -1) return { executed: false, reason: 'no open position' }
      const rawFill = getFillPrice(this.cfg.ohlcv[decision.coin] ?? [], this.currentTime, this.cfg.intervalMs)
      if (rawFill === undefined) return { executed: false, reason: 'no fill price available' }
      const pos = this.openPositions[posIndex]
      this.closePosition(posIndex, rawFill, this.currentTime)
      const sellFillPrice = rawFill * (1 - this.cfg.slippageBps / 10000)
      const sellOrder: Order = { id: randomUUID(), coin: decision.coin, side: 'sell', size: pos.size, createdAt: this.currentTime, status: 'filled', fillPrice: sellFillPrice, filledAt: this.currentTime }
      return { executed: true, order: sellOrder }
    }

    return { executed: false, reason: 'hold' }
  }

  private closePosition(posIndex: number, rawFill: number, closeTime: Date): void {
    const pos = this.openPositions[posIndex]
    // Sells slip downward (we receive less than the quoted open).
    const fillPrice = rawFill * (1 - this.cfg.slippageBps / 10000)
    const units = pos.size / pos.entryPrice
    const proceeds = units * fillPrice
    const exitFee = proceeds * this.cfg.feeRate
    pos.exitPrice = fillPrice
    pos.closedAt = closeTime
    pos.fees += exitFee
    pos.pnl = proceeds - pos.size - pos.fees
    this.capital += proceeds - exitFee
    this.highWaterMarks.delete(pos.coin)
    this.closedTrades.push(pos)
    this.openPositions.splice(posIndex, 1)
  }

  async checkStopLosses(): Promise<void> {
    const ts = this.currentTime.getTime()
    for (let i = this.openPositions.length - 1; i >= 0; i--) {
      const pos = this.openPositions[i]
      const candle = lastCandleAtOrBefore(this.cfg.ohlcv[pos.coin] ?? [], ts)

      // Take-profit: check candle high against target; fill at the target price.
      if (pos.takeProfit !== undefined && candle && candle.high >= pos.takeProfit) {
        this.closePosition(i, pos.takeProfit, this.currentTime)
        continue
      }

      // Trailing stop: ratchet using candle close to match live (which sees close-price updates).
      // Using high would be optimistic — live can't act on an intra-bar wick it never observed.
      if (pos.stopLoss !== undefined && candle) {
        const hwm = this.highWaterMarks.get(pos.coin) ?? pos.entryPrice
        if (candle.close > hwm) {
          this.highWaterMarks.set(pos.coin, candle.close)
          const trailedStop = candle.close * (1 - this.cfg.trailingStopPct)
          if (trailedStop > pos.stopLoss) pos.stopLoss = trailedStop
        }
      }

      // Stop-loss: use candle low for intrabar detection; fill at stop price.
      if (pos.stopLoss !== undefined) {
        const low = candle?.low ?? pos.entryPrice
        if (low <= pos.stopLoss) {
          this.closePosition(i, pos.stopLoss, this.currentTime)
        }
      }
    }
  }

  pushPnlPoint(timestamp: Date): void {
    const ts = timestamp.getTime()
    const openValue = this.openPositions.reduce((sum, p) => {
      const price = lastCandleAtOrBefore(this.cfg.ohlcv[p.coin] ?? [], ts)?.close ?? p.entryPrice
      return sum + (p.size / p.entryPrice) * price
    }, 0)
    this.pnlCurve.push({ timestamp, capital: this.capital + openValue })
  }

  forceCloseAll(endTime: Date): void {
    for (let i = this.openPositions.length - 1; i >= 0; i--) {
      const pos = this.openPositions[i]
      const lastCandle = this.cfg.ohlcv[pos.coin]?.at(-1)
      if (lastCandle) this.closePosition(i, lastCandle.close, endTime)
    }
    this.pnlCurve.push({ timestamp: endTime, capital: this.capital })
  }
}

export class BacktestRunner {
  #cancelled = false
  private readonly logger = new Logger(BacktestRunner.name)

  constructor(private readonly config: BacktestConfig) {}

  /** Signal the run loop to stop after the current step. */
  cancel(): void { this.#cancelled = true }

  get wasCancelled(): boolean { return this.#cancelled }

  async run(): Promise<BacktestResult> {
    const { from, to, initialCapital, autoTradeLimit, coins, sources, ohlcv, adapter } = this.config
    const intervalMs = this.config.intervalMs ?? 15 * 60 * 1000
    const feeRate = this.config.feeRate ?? 0.001
    const slippageBps = this.config.slippageBps ?? 5

    // Fetch all historical signals upfront and sort for binary search in historicalSlice.
    const allSignals: Signal[] = []
    const sourceResults = await Promise.allSettled(
      sources.map(async source => {
        const signals = await source.fetchHistorical(from, to)
        allSignals.push(...signals)
      }),
    )
    for (const r of sourceResults) {
      if (r.status === 'rejected') this.logger.warn(`Signal source failed: ${String(r.reason)}`)
    }
    allSignals.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    const pipeline = new HistoricalPipeline(allSignals, ohlcv)
    const engine = new SimulatedEngine({
      initialCapital,
      autoTradeLimit,
      coins,
      ohlcv,
      intervalMs,
      feeRate,
      slippageBps,
      maxPositions: this.config.maxPositions ?? 5,
      dailyLossLimitPct: this.config.dailyLossLimitPct ?? 0.05,
      maxSinglePositionPct: this.config.maxSinglePositionPct ?? 0.25,
      trailingStopPct: this.config.trailingStopPct ?? 0.10,
    })

    // EvaluationCycle is the single decision loop shared with the live runner.
    // getRecentTrades wires the same context the live runner provides via DB.
    const cycle = new EvaluationCycle({
      pipeline,
      adapter,
      engine,
      autoTradeLimit,
      riskPerTradePct: this.config.riskPerTradePct,
      minConfidence: this.config.minConfidence,
      promptOverrides: this.config.promptOverrides,
      getRecentTrades: () => Promise.resolve(engine.getClosedTrades().slice(-5).map(toTrade)),
    })

    const end = to.getTime()
    // Skip warmup bars so long-window indicators (EMA-50 etc.) are warm before the first LLM call.
    // Default 0 (no warmup); set to 50 for production runs.
    const warmupBars = this.config.warmupBars ?? 0
    let current = from.getTime() + warmupBars * intervalMs
    const total = Math.ceil((end - current) / intervalMs)
    let step = 1

    while (current < end && !this.#cancelled) {
      const currentTime = new Date(current)
      pipeline.setTime(currentTime)
      engine.setTime(currentTime)

      const cycleResults = await cycle.run()

      engine.pushPnlPoint(currentTime)

      try {
        await this.config.onStep?.(step, total, currentTime, cycleResults)
      } catch (err) {
        this.logger.warn(`onStep callback threw: ${String(err)}`)
      }

      current += intervalMs
      step++
    }

    engine.forceCloseAll(new Date(this.#cancelled ? current : end))

    const stats = calculateStats(engine.trades, initialCapital, engine.pnlCurve, intervalMs)
    return { trades: engine.trades, stats, pnlCurve: engine.pnlCurve }
  }
}
