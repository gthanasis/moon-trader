export interface ExecutedOrder {
  orderId: string
  fillPrice: number
  filledAt: Date
  baseAmount: number
}

export interface ExchangeAdapter {
  marketBuy(coin: string, costInQuote: number): Promise<ExecutedOrder>
  marketSell(coin: string, baseAmount: number): Promise<ExecutedOrder>
}

interface CcxtOrderResult {
  id: string
  average?: number
  price?: number
  amount: number
  filled?: number
  datetime?: string
  timestamp?: number
}

interface CcxtExchangeLike {
  createMarketBuyOrderWithCost(symbol: string, cost: number): Promise<CcxtOrderResult>
  createMarketSellOrder(symbol: string, amount: number): Promise<CcxtOrderResult>
}

function toExecutedOrder(order: CcxtOrderResult): ExecutedOrder {
  return {
    orderId: order.id,
    fillPrice: order.average ?? order.price ?? 0,
    filledAt: order.datetime
      ? new Date(order.datetime)
      : new Date(order.timestamp ?? Date.now()),
    baseAmount: order.filled ?? order.amount,
  }
}

export class CcxtExchangeAdapter implements ExchangeAdapter {
  constructor(private readonly exchange: CcxtExchangeLike) {}

  async marketBuy(coin: string, costInQuote: number): Promise<ExecutedOrder> {
    const order = await this.exchange.createMarketBuyOrderWithCost(coin, costInQuote)
    return toExecutedOrder(order)
  }

  async marketSell(coin: string, baseAmount: number): Promise<ExecutedOrder> {
    const order = await this.exchange.createMarketSellOrder(coin, baseAmount)
    return toExecutedOrder(order)
  }
}
