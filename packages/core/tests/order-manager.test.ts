import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OrderManager } from '../src/order-manager.js'
import type { ExchangeAdapter, ExecutedOrder } from '../src/exchange-adapter.js'

describe('OrderManager (paper mode)', () => {
  let manager: OrderManager

  beforeEach(() => {
    manager = new OrderManager({ paper: true })
  })

  it('places a buy order and returns it as filled immediately in paper mode', async () => {
    const order = await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 100, price: 50000 })
    expect(order.status).toBe('filled')
    expect(order.fillPrice).toBe(50000)
  })

  it('places a sell order and returns it as filled in paper mode', async () => {
    const order = await manager.place({ coin: 'BTC/USDT', side: 'sell', size: 100, price: 51000 })
    expect(order.status).toBe('filled')
    expect(order.fillPrice).toBe(51000)
  })

  it('tracks open orders before fill in paper mode sync test', async () => {
    const order = await manager.place({ coin: 'ETH/USDT', side: 'buy', size: 50, price: 3000 })
    expect(manager.getOrder(order.id)).toBeDefined()
  })

  it('cancels an order', async () => {
    const order = await manager.place({ coin: 'ETH/USDT', side: 'buy', size: 50, price: 3000 })
    await manager.cancel(order.id)
    expect(manager.getOrder(order.id)?.status).toBe('cancelled')
  })

  it('lists all open (filled in paper mode) orders', async () => {
    await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 100, price: 50000 })
    await manager.place({ coin: 'ETH/USDT', side: 'buy', size: 50, price: 3000 })
    expect(manager.getOpenOrders()).toHaveLength(0)
  })
})

function makeMockExchange(overrides: Partial<ExchangeAdapter> = {}): ExchangeAdapter {
  return {
    marketBuy: vi.fn(async (): Promise<ExecutedOrder> => ({
      orderId: 'live-buy-1',
      fillPrice: 50500,
      filledAt: new Date(),
      baseAmount: 0.00396,
    })),
    marketSell: vi.fn(async (): Promise<ExecutedOrder> => ({
      orderId: 'live-sell-1',
      fillPrice: 51000,
      filledAt: new Date(),
      baseAmount: 0.00396,
    })),
    ...overrides,
  }
}

describe('OrderManager live mode', () => {
  it('calls exchange.marketBuy on buy order and fills', async () => {
    const exchange = makeMockExchange()
    const manager = new OrderManager({ paper: false, exchange })

    const order = await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 200 })

    expect(exchange.marketBuy).toHaveBeenCalledWith('BTC/USDT', 200)
    expect(order.status).toBe('filled')
    expect(order.fillPrice).toBe(50500)
  })

  it('calls exchange.marketSell with base amount computed from size/price', async () => {
    const exchange = makeMockExchange()
    const manager = new OrderManager({ paper: false, exchange })

    // Selling $200 worth at current price of $50000 → 0.004 BTC
    await manager.place({ coin: 'BTC/USDT', side: 'sell', size: 200, price: 50000 })

    expect(exchange.marketSell).toHaveBeenCalledWith('BTC/USDT', 0.004)
  })

  it('throws when live sell is attempted without price', async () => {
    const exchange = makeMockExchange()
    const manager = new OrderManager({ paper: false, exchange })

    await expect(
      manager.place({ coin: 'BTC/USDT', side: 'sell', size: 200 })
    ).rejects.toThrow('price')
  })

  it('leaves order open when not paper and no exchange injected', async () => {
    const manager = new OrderManager({ paper: false })

    const order = await manager.place({ coin: 'BTC/USDT', side: 'buy', size: 100 })

    expect(order.status).toBe('open')
  })
})
