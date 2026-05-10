import type { LLMDecision, Position, Order } from '@trader/shared'
import type { ExchangeAdapter } from './exchange-adapter.js'
import { CapitalGuard } from './capital-guard.js'
import { PositionTracker } from './position-tracker.js'
import { OrderManager } from './order-manager.js'

interface TradingEngineConfig {
  totalCapital: number
  paper: boolean
  exchange?: ExchangeAdapter
}

interface ExecuteResult {
  executed: boolean
  reason?: string
  order?: Order
}

export class TradingEngine {
  private readonly guard: CapitalGuard
  private readonly positions: PositionTracker
  private readonly orders: OrderManager
  private readonly currentPrices = new Map<string, number>()

  constructor(config: TradingEngineConfig) {
    this.guard = new CapitalGuard({ totalCapital: config.totalCapital })
    this.positions = new PositionTracker()
    this.orders = new OrderManager({ paper: config.paper, exchange: config.exchange })
  }

  async execute(decision: LLMDecision): Promise<ExecuteResult> {
    if (decision.action === 'hold') {
      return { executed: false, reason: 'hold' }
    }

    if (decision.action === 'buy') {
      if (this.positions.get(decision.coin)) {
        return { executed: false, reason: `Position already open for ${decision.coin}` }
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

      // currentPrice must be kept up-to-date via PositionTracker before execute() is called;
      // it is used only to compute the base amount for the live sell, not as an actual order price
      const order = await this.orders.place({
        coin: decision.coin,
        side: 'sell',
        size: decision.size,
        price: position.currentPrice,
      })

      if (order.status === 'filled') {
        const proceeds = position.entryPrice > 0
          ? (position.size / position.entryPrice) * (order.fillPrice ?? position.currentPrice)
          : decision.size
        this.positions.close(decision.coin)
        this.guard.releaseWithProceeds(position.size, proceeds)
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
    for (const position of this.positions.getAll()) {
      if (position.stopLoss === undefined) continue
      if (position.currentPrice > position.stopLoss) continue
      const order = await this.orders.place({
        coin: position.coin,
        side: 'sell',
        size: position.size,
        price: position.currentPrice,
      })
      if (order.status === 'filled') {
        this.positions.close(position.coin)
        this.guard.release(position.size)
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
