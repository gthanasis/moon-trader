import type { LLMDecision, Position, Order } from '@trader/shared'
import type { ExchangeAdapter } from './exchange-adapter.js'
import { CapitalGuard } from './capital-guard.js'
import { PositionTracker } from './position-tracker.js'
import { OrderManager } from './order-manager.js'

interface TradingEngineConfig {
  totalCapital: number
  paper: boolean
  exchange?: ExchangeAdapter
  /** Maximum number of simultaneous open positions. Default: 5. */
  maxPositions?: number
  /** Fraction of day-start capital that may be lost before new buys are blocked. Default: 0.05 (5%). */
  dailyLossLimitPct?: number
  /** Fee charged on each trade as a fraction of size/proceeds. Default: 0 (no fee in paper). */
  feeRate?: number
  /** Slippage in basis points applied to paper fills. Default: 0. */
  slippageBps?: number
}

interface ExecuteResult {
  executed: boolean
  reason?: string
  order?: Order
}

// Trailing stop: when price makes a new high, ratchet stopLoss up to this % below the peak.
const TRAIL_PCT = 0.10

export class TradingEngine {
  private readonly guard: CapitalGuard
  private readonly positions: PositionTracker
  private readonly orders: OrderManager
  private readonly currentPrices = new Map<string, number>()
  private readonly highWaterMarks = new Map<string, number>()
  private readonly baseQty = new Map<string, number>()
  private readonly maxPositions: number
  private readonly dailyLossLimitPct: number
  private readonly feeRate: number
  private dailyStartCapital: number
  private currentUtcDay: number

  constructor(config: TradingEngineConfig) {
    this.guard = new CapitalGuard({ totalCapital: config.totalCapital })
    this.positions = new PositionTracker()
    this.orders = new OrderManager({ paper: config.paper, exchange: config.exchange, slippageBps: config.slippageBps })
    this.maxPositions = config.maxPositions ?? 5
    this.dailyLossLimitPct = config.dailyLossLimitPct ?? 0.05
    this.feeRate = config.feeRate ?? 0
    this.currentUtcDay = Math.floor(Date.now() / 86400000)
    this.dailyStartCapital = this.currentEquity()
  }

  private currentEquity(): number {
    const openValue = this.positions.getAll().reduce((sum, p) => {
      return sum + (p.entryPrice > 0 ? (p.size / p.entryPrice) * p.currentPrice : p.size)
    }, 0)
    return this.guard.availableCapital() + openValue
  }

  /** Test seam: simulate crossing into a new UTC day, resetting daily loss tracking. */
  advanceDay(): void {
    this.dailyStartCapital = this.currentEquity()
    this.currentUtcDay += 1
  }

  private refreshDailyReset(): void {
    const today = Math.floor(Date.now() / 86400000)
    if (today !== this.currentUtcDay) {
      this.dailyStartCapital = this.currentEquity()
      this.currentUtcDay = today
    }
  }

  async execute(decision: LLMDecision): Promise<ExecuteResult> {
    if (decision.action === 'hold') {
      return { executed: false, reason: 'hold' }
    }

    if (decision.action === 'buy') {
      this.refreshDailyReset()

      if (this.positions.get(decision.coin)) {
        return { executed: false, reason: `Position already open for ${decision.coin}` }
      }

      if (this.positions.getAll().length >= this.maxPositions) {
        return { executed: false, reason: `Max positions reached (${this.maxPositions})` }
      }

      const dailyDrawdown = this.dailyStartCapital - this.currentEquity()
      if (dailyDrawdown > this.dailyStartCapital * this.dailyLossLimitPct) {
        const lossPct = (dailyDrawdown / this.dailyStartCapital * 100).toFixed(1)
        return { executed: false, reason: `Daily loss limit hit: lost ${lossPct}% today` }
      }

      if (!this.guard.canTrade(decision.size)) {
        return {
          executed: false,
          reason: `Insufficient capital: need ${decision.size}, have ${this.guard.availableCapital()}`,
        }
      }

      const order = await this.orders.place({
        coin: decision.coin,
        side: 'buy',
        size: decision.size,
        price: this.currentPrices.get(decision.coin),
      })

      if (order.status === 'filled') {
        if (!order.fillPrice || order.fillPrice <= 0) {
          console.error(`[TradingEngine] Invalid fill price for ${decision.coin}: ${order.fillPrice}`)
          return { executed: false, reason: `Invalid fill price for ${decision.coin}` }
        }
        this.guard.reserve(decision.size)
        this.guard.deductFee(decision.size * this.feeRate)
        this.baseQty.set(decision.coin, decision.size / order.fillPrice)
        this.positions.open({
          coin: decision.coin,
          size: decision.size,
          entryPrice: order.fillPrice,
          currentPrice: order.fillPrice,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
        })
      }

      return { executed: true, order }
    }

    if (decision.action === 'sell') {
      const position = this.positions.get(decision.coin)
      if (!position) {
        return { executed: false, reason: `No open position for ${decision.coin}` }
      }

      const order = await this.orders.place({
        coin: decision.coin,
        side: 'sell',
        size: position.size,
        price: position.currentPrice,
        baseQty: this.baseQty.get(decision.coin),
      })

      if (order.status === 'filled') {
        const grossProceeds = position.entryPrice > 0
          ? (position.size / position.entryPrice) * (order.fillPrice ?? position.currentPrice)
          : position.size
        const sellFee = grossProceeds * this.feeRate
        const netProceeds = grossProceeds - sellFee
        this.positions.close(decision.coin)
        this.baseQty.delete(decision.coin)
        this.currentPrices.delete(decision.coin)
        this.guard.releaseWithProceeds(position.size, netProceeds)
      }

      return { executed: true, order }
    }

    return { executed: false, reason: 'unknown action' }
  }

  updatePositionPrice(coin: string, price: number): void {
    this.currentPrices.set(coin, price)
    this.positions.updatePrice(coin, price)
  }

  async checkStopLosses(): Promise<void> {
    this.refreshDailyReset()
    for (const position of this.positions.getAll()) {
      const price = position.currentPrice

      // Update trailing stop: ratchet stopLoss up when price makes a new high.
      if (position.stopLoss !== undefined) {
        const hwm = this.highWaterMarks.get(position.coin) ?? position.entryPrice
        if (price > hwm) {
          this.highWaterMarks.set(position.coin, price)
          const trailedStop = price * (1 - TRAIL_PCT)
          if (trailedStop > position.stopLoss) {
            this.positions.updateStopLoss(position.coin, trailedStop)
          }
        }
      }

      // Re-read position after potential stopLoss update.
      const current = this.positions.get(position.coin)
      if (!current) continue

      const hitStop = current.stopLoss !== undefined && price <= current.stopLoss
      const hitTakeProfit = current.takeProfit !== undefined && price >= current.takeProfit

      if (!hitStop && !hitTakeProfit) continue

      const order = await this.orders.place({
        coin: current.coin,
        side: 'sell',
        size: current.size,
        price,
        baseQty: this.baseQty.get(current.coin),
      })
      if (order.status === 'filled') {
        const grossProceeds = current.entryPrice > 0
          ? (current.size / current.entryPrice) * (order.fillPrice ?? price)
          : current.size
        const netProceeds = grossProceeds * (1 - this.feeRate)
        this.positions.close(current.coin)
        this.highWaterMarks.delete(current.coin)
        this.baseQty.delete(current.coin)
        this.currentPrices.delete(current.coin)
        this.guard.releaseWithProceeds(current.size, netProceeds)
      }
    }
  }

  getPositions(): Position[] {
    return this.positions.getAll()
  }

  getOpenOrders(): Order[] {
    return this.orders.getOpenOrders()
  }

  availableCapital(): number {
    return this.guard.availableCapital()
  }
}
