export type OrderSide = 'buy' | 'sell'
export type OrderStatus = 'open' | 'filled' | 'cancelled'

export interface Order {
  id: string
  coin: string
  side: OrderSide
  size: number
  price?: number
  status: OrderStatus
  createdAt: Date
  filledAt?: Date
  fillPrice?: number
}

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
