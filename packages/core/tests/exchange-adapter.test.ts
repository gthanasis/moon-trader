import { describe, it, expect, vi } from 'vitest'
import { CcxtExchangeAdapter } from '../src/exchange-adapter.js'

type CcxtOrder = {
  id: string
  average?: number
  price?: number
  amount: number
  datetime?: string
  timestamp?: number
}

function makeMockCcxt(overrides: Partial<{
  buyResult: CcxtOrder
  sellResult: CcxtOrder
}> = {}) {
  const buyResult: CcxtOrder = overrides.buyResult ?? {
    id: 'buy-1',
    average: 50000,
    amount: 0.004,
    datetime: '2024-01-01T00:00:00.000Z',
  }
  const sellResult: CcxtOrder = overrides.sellResult ?? {
    id: 'sell-1',
    average: 51000,
    amount: 0.004,
    datetime: '2024-01-01T01:00:00.000Z',
  }
  return {
    createMarketBuyOrderWithCost: vi.fn(async () => buyResult),
    createMarketSellOrder: vi.fn(async () => sellResult),
  }
}

describe('CcxtExchangeAdapter', () => {
  it('marketBuy calls createMarketBuyOrderWithCost with coin and cost', async () => {
    const ccxt = makeMockCcxt()
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketBuy('BTC/USDT', 200)

    expect(ccxt.createMarketBuyOrderWithCost).toHaveBeenCalledWith('BTC/USDT', 200)
    expect(result.orderId).toBe('buy-1')
    expect(result.fillPrice).toBe(50000)
    expect(result.baseAmount).toBe(0.004)
    expect(result.filledAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('marketSell calls createMarketSellOrder with coin and base amount', async () => {
    const ccxt = makeMockCcxt()
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketSell('BTC/USDT', 0.004)

    expect(ccxt.createMarketSellOrder).toHaveBeenCalledWith('BTC/USDT', 0.004)
    expect(result.orderId).toBe('sell-1')
    expect(result.fillPrice).toBe(51000)
  })

  it('uses price field as fallback when average is absent', async () => {
    const ccxt = makeMockCcxt({
      buyResult: { id: 'x', price: 49000, amount: 0.001 },
    })
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketBuy('BTC/USDT', 50)

    expect(result.fillPrice).toBe(49000)
  })

  it('uses timestamp ms as fallback when datetime is absent', async () => {
    const now = Date.now()
    const ccxt = makeMockCcxt({
      buyResult: { id: 'x', average: 50000, amount: 0.001, timestamp: now },
    })
    const adapter = new CcxtExchangeAdapter(ccxt)

    const result = await adapter.marketBuy('BTC/USDT', 50)

    expect(result.filledAt.getTime()).toBe(now)
  })
})
