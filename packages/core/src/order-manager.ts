import type { Order, OrderSide } from '@trader/shared'
import type { ExchangeAdapter } from './exchange-adapter.js'
import { randomUUID } from 'crypto'

interface PlaceOrderInput {
  coin: string
  side: OrderSide
  size: number
  price?: number
  /** Exact base-asset quantity to sell. When provided on live sells, used instead of size/price arithmetic. */
  baseQty?: number
}

interface OrderManagerConfig {
  paper: boolean
  exchange?: ExchangeAdapter
  /** Slippage applied to paper fills in basis points (1 bps = 0.01%). Default: 0. */
  slippageBps?: number
}

export class OrderManager {
  private readonly paper: boolean
  private readonly exchange?: ExchangeAdapter
  private readonly slippageBps: number
  private orders = new Map<string, Order>()

  constructor(config: OrderManagerConfig) {
    this.paper = config.paper
    this.exchange = config.exchange
    this.slippageBps = config.slippageBps ?? 0
  }

  async place(input: PlaceOrderInput): Promise<Order> {
    const common = {
      id: randomUUID(),
      coin: input.coin,
      side: input.side,
      size: input.size,
      price: input.price,
      createdAt: new Date(),
    }

    if (this.paper) {
      if (input.price === undefined) {
        const order: Order = { ...common, status: 'open' }
        this.orders.set(order.id, order)
        return order
      }
      const slip = this.slippageBps / 10000
      const fillPrice = input.side === 'buy'
        ? input.price * (1 + slip)
        : input.price * (1 - slip)
      const order: Order = { ...common, status: 'filled', fillPrice, filledAt: new Date() }
      this.orders.set(order.id, order)
      return order
    }

    if (this.exchange) {
      if (input.side === 'buy') {
        const result = await this.exchange.marketBuy(input.coin, input.size)
        const order: Order = { ...common, status: 'filled', fillPrice: result.fillPrice, filledAt: result.filledAt }
        this.orders.set(order.id, order)
        return order
      } else {
        const baseAmount = input.baseQty ?? (input.price !== undefined ? input.size / input.price : undefined)
        if (baseAmount === undefined) {
          throw new Error(`baseQty or price is required for live sell orders on ${input.coin}`)
        }
        const result = await this.exchange.marketSell(input.coin, baseAmount)
        const order: Order = { ...common, status: 'filled', fillPrice: result.fillPrice, filledAt: result.filledAt }
        this.orders.set(order.id, order)
        return order
      }
    }

    const order: Order = { ...common, status: 'open' }
    this.orders.set(order.id, order)
    return order
  }

  getOpenOrders(): Order[] {
    return Array.from(this.orders.values()).filter(o => o.status === 'open')
  }
}
