export type OrderSide = 'buy' | 'sell'

type OrderCommon = {
  id: string
  coin: string
  side: OrderSide
  size: number
  price?: number
  createdAt: Date
}

export type Order =
  | (OrderCommon & { status: 'open' })
  | (OrderCommon & { status: 'filled'; fillPrice: number; filledAt: Date })
  | (OrderCommon & { status: 'cancelled' })

export interface Position {
  coin: string
  size: number
  entryPrice: number
  currentPrice: number
  openedAt: Date
  stopLoss?: number
  takeProfit?: number
}

export interface Trade {
  id: string
  coin: string
  side: OrderSide
  size: number
  entryPrice: number
  exitPrice?: number
  openedAt: Date
  closedAt?: Date
  pnl?: number
  reasoning?: string
}
