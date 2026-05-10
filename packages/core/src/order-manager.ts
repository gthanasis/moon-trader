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
    const order: Order = {
      id: randomUUID(),
      coin: input.coin,
      side: input.side,
      size: input.size,
      price: input.price,
      status: 'open',
      createdAt: new Date(),
    }

    if (this.paper) {
      order.status = 'filled'
      order.filledAt = new Date()
      const slip = this.slippageBps / 10000
      order.fillPrice = input.price !== undefined
        ? input.side === 'buy'
          ? input.price * (1 + slip)
          : input.price * (1 - slip)
        : input.price
    } else if (this.exchange) {
      if (input.side === 'buy') {
        const result = await this.exchange.marketBuy(input.coin, input.size)
        order.status = 'filled'
        order.filledAt = result.filledAt
        order.fillPrice = result.fillPrice
      } else {
        const baseAmount = input.baseQty ?? (input.price !== undefined ? input.size / input.price : undefined)
        if (baseAmount === undefined) {
          throw new Error(`baseQty or price is required for live sell orders on ${input.coin}`)
        }
        const result = await this.exchange.marketSell(input.coin, baseAmount)
        order.status = 'filled'
        order.filledAt = result.filledAt
        order.fillPrice = result.fillPrice
      }
    }

    this.orders.set(order.id, order)
    return order
  }

  async cancel(orderId: string): Promise<void> {
    const order = this.orders.get(orderId)
    if (order && order.status !== 'cancelled') {
      this.orders.set(orderId, { ...order, status: 'cancelled' })
    }
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId)
  }

  getOpenOrders(): Order[] {
    return Array.from(this.orders.values()).filter(o => o.status === 'open')
  }

  getAllOrders(): Order[] {
    return Array.from(this.orders.values())
  }
}
