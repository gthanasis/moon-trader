import { Logger } from '@nestjs/common'
import type { LLMDecision, Position, Order } from '../common'
import type { ExchangeAdapter } from './exchange-adapter'
import { CapitalGuard } from './capital-guard'
import { PositionTracker } from './position-tracker'
import { OrderManager } from './order-manager'

export interface PositionClosedEvent {
  coin: string
  fillPrice: number
  /**
   * Net PnL after fees (negative = loss). For a full close this is the total
   * across all legs (partial take-profits plus the final exit); for a partial
   * exit it is just that leg's realised PnL.
   */
  pnl: number
  reason: 'sell' | 'stop' | 'takeprofit'
  /** True when the position was only partially closed and stays open. */
  partial: boolean
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
  /**
   * Fraction of a position sold the first time price hits take-profit.
   * The remainder rides the trailing stop. 1 = no partial (full TP exit).
   * Default: 0.5.
   */
  takeProfitTierPct?: number
  /** Move the stop to break-even after the take-profit tier is banked. Default: true. */
  breakEvenAfterTier?: boolean
  /** Called whenever a position is closed, from both LLM sell decisions and stop/TP exits. */
  onPositionClosed?: (event: PositionClosedEvent) => void | Promise<void>
}

interface ExecuteResult {
  executed: boolean
  reason?: string
  order?: Order
  /** True when a buy added to an existing position rather than opening a new one. */
  scaledIn?: boolean
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
  // Mutable: updated at runtime via applySettings().
  private takeProfitTierPct: number
  private breakEvenAfterTier: boolean
  /** Realised PnL banked from partial take-profits, per still-open coin. */
  private readonly partialRealisedPnl = new Map<string, number>()
  /** Coins whose take-profit tier has already been banked this position. */
  private readonly tierTaken = new Set<string>()
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
    this.takeProfitTierPct = config.takeProfitTierPct ?? 0.5
    this.breakEvenAfterTier = config.breakEvenAfterTier ?? true
    this.onPositionClosed = config.onPositionClosed
    this.currentUtcDay = Math.floor(Date.now() / 86400000)
    this.dailyStartCapital = this.currentEquity()
  }

  /**
   * Applies runtime-editable settings without restarting the engine. When
   * `paperMode` is provided the order manager is flipped between simulated
   * and real fills in place.
   */
  applySettings(settings: {
    maxPositions: number
    dailyLossLimitPct: number
    takeProfitTierPct?: number
    breakEvenAfterTier?: boolean
    paperMode?: boolean
  }): void {
    this.maxPositions = settings.maxPositions
    this.dailyLossLimitPct = settings.dailyLossLimitPct
    if (settings.takeProfitTierPct !== undefined) this.takeProfitTierPct = settings.takeProfitTierPct
    if (settings.breakEvenAfterTier !== undefined) this.breakEvenAfterTier = settings.breakEvenAfterTier
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

      const existing = this.positions.get(decision.coin)
      if (existing) {
        return this.scaleIn(decision, existing)
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
        const legPnl = netProceeds - position.size
        const totalPnl = legPnl + (this.partialRealisedPnl.get(decision.coin) ?? 0)
        this.guard.releaseWithProceeds(position.size, netProceeds)
        this.closePositionBookkeeping(decision.coin)
        await this.onPositionClosed?.({ coin: decision.coin, fillPrice: order.fillPrice, pnl: totalPnl, reason: 'sell', partial: false })
      } else {
        // The exit order did not fill. The position is still open on the
        // exchange and still tracked here — surface it loudly rather than
        // silently reporting success.
        this.logger.error(
          `Sell order for ${decision.coin} did not fill (status: ${order.status}); position remains open`,
        )
        return { executed: false, reason: `Sell order for ${decision.coin} did not fill` }
      }

      return { executed: true, order }
    }

    return { executed: false, reason: 'unknown action' }
  }

  /**
   * Adds to an existing position rather than rejecting a repeat buy. The
   * combined position size is capped at `maxSinglePositionPct` of the capital
   * that could sit in this position (free capital + the amount already
   * deployed here). The position keeps its original stop-loss/take-profit.
   * Daily-reset is assumed already refreshed by the caller (`execute`).
   */
  private async scaleIn(decision: LLMDecision, existing: Position): Promise<ExecuteResult> {
    const dailyDrawdown = this.dailyStartCapital - this.currentEquity()
    if (dailyDrawdown > this.dailyStartCapital * this.dailyLossLimitPct) {
      const lossPct = (dailyDrawdown / this.dailyStartCapital * 100).toFixed(1)
      return { executed: false, reason: `Daily loss limit hit: lost ${lossPct}% today` }
    }

    const maxSize = (this.guard.availableCapital() + existing.size) * this.maxSinglePositionPct
    const combinedSize = existing.size + decision.size
    if (combinedSize > maxSize) {
      return {
        executed: false,
        reason: `Scale-in rejected: combined size ${combinedSize.toFixed(2)} exceeds max single position (${(this.maxSinglePositionPct * 100).toFixed(0)}% = ${maxSize.toFixed(2)})`,
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
    this.baseQty.set(decision.coin, (this.baseQty.get(decision.coin) ?? 0) + decision.size / order.fillPrice)
    this.positions.scaleIn(decision.coin, decision.size, order.fillPrice)

    return { executed: true, order, scaledIn: true }
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

      // First take-profit touch: bank a tier, move the stop to break-even, and
      // let the remainder ride the trailing stop (takeProfit is then cleared).
      if (hitTakeProfit && !hitStop && this.takeProfitTierPct < 1 && !this.tierTaken.has(current.coin)) {
        await this.takePartialProfit(current, price)
        continue
      }

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
        const legPnl = netProceeds - current.size
        const totalPnl = legPnl + (this.partialRealisedPnl.get(current.coin) ?? 0)
        const reason: PositionClosedEvent['reason'] = hitTakeProfit ? 'takeprofit' : 'stop'
        this.guard.releaseWithProceeds(current.size, netProceeds)
        this.closePositionBookkeeping(current.coin)
        await this.onPositionClosed?.({ coin: current.coin, fillPrice: order.fillPrice, pnl: totalPnl, reason, partial: false })
      } else {
        // A stop-loss / take-profit sell that does not fill must not be
        // silently dropped — the protective exit failed for this cycle and the
        // position stays exposed until the next check.
        this.logger.error(
          `Stop/take-profit sell for ${current.coin} did not fill (status: ${order.status}); ` +
            `position remains exposed`,
        )
      }
    }
  }

  /** Removes a closed position from all per-coin engine bookkeeping. */
  private closePositionBookkeeping(coin: string): void {
    this.positions.close(coin)
    this.highWaterMarks.delete(coin)
    this.baseQty.delete(coin)
    this.currentPrices.delete(coin)
    this.partialRealisedPnl.delete(coin)
    this.tierTaken.delete(coin)
  }

  /**
   * Banks the take-profit tier: sells `takeProfitTierPct` of the position,
   * moves the stop to break-even, and clears takeProfit so the remainder
   * rides the trailing stop. The leg's PnL is accumulated so the eventual
   * full close reports the total across all legs.
   */
  private async takePartialProfit(current: Position, price: number): Promise<void> {
    const tierPct = this.takeProfitTierPct
    const removedSize = current.size * tierPct
    const fullBaseQty = this.baseQty.get(current.coin) ?? (current.entryPrice > 0 ? current.size / current.entryPrice : 0)
    const removedBaseQty = fullBaseQty * tierPct

    const order = await this.orders.place({
      coin: current.coin, side: 'sell', size: removedSize, price, baseQty: removedBaseQty,
    })
    if (order.status !== 'filled') return

    const grossProceeds = current.entryPrice > 0
      ? (removedSize / current.entryPrice) * order.fillPrice
      : removedSize
    const netProceeds = grossProceeds * (1 - this.feeRate)
    const legPnl = netProceeds - removedSize

    this.positions.reduce(current.coin, tierPct)
    this.baseQty.set(current.coin, fullBaseQty - removedBaseQty)
    this.guard.releaseWithProceeds(removedSize, netProceeds)
    this.partialRealisedPnl.set(current.coin, (this.partialRealisedPnl.get(current.coin) ?? 0) + legPnl)
    this.tierTaken.add(current.coin)

    // Move the stop to break-even — never looser than the current/trailed stop.
    if (this.breakEvenAfterTier) {
      this.positions.updateStopLoss(current.coin, Math.max(current.entryPrice, current.stopLoss ?? current.entryPrice))
    }
    this.positions.clearTakeProfit(current.coin)

    await this.onPositionClosed?.({ coin: current.coin, fillPrice: order.fillPrice, pnl: legPnl, reason: 'takeprofit', partial: true })
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
