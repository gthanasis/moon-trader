import { describe, it, expect, beforeEach } from 'vitest'
import { OrderManager } from '../src/order-manager.js'

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
