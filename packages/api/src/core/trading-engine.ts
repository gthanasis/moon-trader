import { Logger } from '@nestjs/common'
import type { LLMDecision, Position, Order } from '../common'
import type { ExchangeAdapter } from './exchange-adapter'
import { CapitalGuard } from './capital-guard'
import { PositionTracker } from './position-tracker'
import { OrderManager } from './order-manager'

export interface PositionClosedEvent {
  coin: string
  fillPrice: number
  /** Net PnL after fees (negative = loss). */
  pnl: number
  reason: 'sell' | 'stop' | 'takeprofit'
}

interface TradingEngineConfig {
  totalCapital: number
  paper: boolean
  exchange?: ExchangeAdapter
  /** Maximum number of simultaneous open positions. Default: 5. */
  maxPositions?: number
  /** Maximum fraction of available capital in a single position. Default: 0.25 (25%). */
  maxSinglePositionPct?: number
  /** Fraction of day-start capital that may be lost before new buys are blocked. Default: 0.05 (5%). */
  dailyLossLimitPct?: number
  /** Fee charged on each trade as a fraction of size/proceeds. Default: 0 (no fee in paper). */
  feeRate?: number
  /** Slippage in basis points applied to paper fills. Default: 0. */
  slippageBps?: number
  /** Trailing stop percentage below the high-water mark. Default: 0.10 (10%). */
  trailingStopPct?: number
  /** Called whenever a position is closed, from both LLM sell decisions and stop/TP exits. */
  onPositionClosed?: (event: PositionClosedEvent) => void | Promise<void>
}

interface ExecuteResult {
  executed: boolean
  reason?: string
  order?: Order
}

export class TradingEngine {
  private readonly logger = new Logger(TradingEngine.name)
  private readonly guard: CapitalGuard
  private readonly positions: PositionTracker
  private readonly orders: OrderManager
  private readonly currentPrices = new Map<string, number>()
  private readonly highWaterMarks = new Map<string, number>()
  private readonly baseQty = new Map<string, number>()
  // Mutable: updated at runtime via applySettings() from the web settings page.
  private maxPositions: number
  private readonly maxSinglePositionPct: number
  // Mutable: updated at runtime via applySettings().
  private dailyLossLimitPct: number
  private readonly feeRate: number
  private readonly trailingStopPct: number
  private readonly onPositionClosed: ((event: PositionClosedEvent) => void | Promise<void>) | undefined
  private dailyStartCapital: number
  private currentUtcDay: number

  constructor(config: TradingEngineConfig) {
    this.guard = new CapitalGuard({ totalCapital: config.totalCapital })
    this.positions = new PositionTracker()
    this.orders = new OrderManager({ paper: config.paper, exchange: config.exchange, slippageBps: config.slippageBps })
    this.maxPositions = config.maxPositions ?? 5
    this.maxSinglePositionPct = config.maxSinglePositionPct ?? 0.25
    this.dailyLossLimitPct = config.dailyLossLimitPct ?? 0.05
    this.feeRate = config.feeRate ?? 0
    this.trailingStopPct = config.trailingStopPct ?? 0.10
    this.onPositionClosed = config.onPositionClosed
    this.currentUtcDay = Math.floor(Date.now() / 86400000)
    this.dailyStartCapital = this.currentEquity()
  }

  /**
   * Applies runtime-editable settings without restarting the engine. When
   * `paperMode` is provided the order manager is flipped between simulated
   * and real fills in place.
   */
  applySettings(settings: { maxPositions: number; dailyLossLimitPct: number; paperMode?: boolean }): void {
    this.maxPositions = settings.maxPositions
    this.dailyLossLimitPct = settings.dailyLossLimitPct
    if (settings.paperMode !== undefined) this.orders.setPaper(settings.paperMode)
  }

  /** True when the engine is simulating fills rather than trading for real. */
  isPaper(): boolean {
    return this.orders.isPaper()
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

      const maxSize = this.guard.availableCapital() * this.maxSinglePositionPct
      if (decision.size > maxSize) {
        return {
          executed: false,
          reason: `Size ${decision.size.toFixed(2)} exceeds max single position (${(this.maxSinglePositionPct * 100).toFixed(0)}% of capital = ${maxSize.toFixed(2)})`,
        }
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

      if (order.status !== 'filled') {
        return { executed: false, reason: 'no fill price available' }
      }
      if (order.fillPrice <= 0) {
        this.logger.error(`Invalid fill price for ${decision.coin}: ${order.fillPrice}`)
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
          ? (position.size / position.entryPrice) * order.fillPrice
          : position.size
        const sellFee = grossProceeds * this.feeRate
        const netProceeds = grossProceeds - sellFee
        const pnl = netProceeds - position.size
        this.positions.close(decision.coin)
        this.baseQty.delete(decision.coin)
        this.currentPrices.delete(decision.coin)
        this.guard.releaseWithProceeds(position.size, netProceeds)
        await this.onPositionClosed?.({ coin: decision.coin, fillPrice: order.fillPrice, pnl, reason: 'sell' })
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
          const trailedStop = price * (1 - this.trailingStopPct)
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
          ? (current.size / current.entryPrice) * order.fillPrice
          : current.size
        const netProceeds = grossProceeds * (1 - this.feeRate)
        const pnl = netProceeds - current.size
        const reason: PositionClosedEvent['reason'] = hitTakeProfit ? 'takeprofit' : 'stop'
        this.positions.close(current.coin)
        this.highWaterMarks.delete(current.coin)
        this.baseQty.delete(current.coin)
        this.currentPrices.delete(current.coin)
        this.guard.releaseWithProceeds(current.size, netProceeds)
        await this.onPositionClosed?.({ coin: current.coin, fillPrice: order.fillPrice, pnl, reason })
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
