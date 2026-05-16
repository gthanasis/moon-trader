import type { Position } from '../common'

type OpenPositionInput = Pick<Position, 'coin' | 'size' | 'entryPrice' | 'currentPrice'> & {
  stopLoss?: number
  takeProfit?: number
}

export class PositionTracker {
  private positions = new Map<string, Position>()

  open(input: OpenPositionInput): Position {
    const position: Position = {
      ...input,
      openedAt: new Date(),
    }
    this.positions.set(input.coin, position)
    return position
  }

  close(coin: string): Position | undefined {
    const position = this.positions.get(coin)
    this.positions.delete(coin)
    return position
  }

  get(coin: string): Position | undefined {
    return this.positions.get(coin)
  }

  getAll(): Position[] {
    return Array.from(this.positions.values())
  }

  updatePrice(coin: string, currentPrice: number): void {
    const position = this.positions.get(coin)
    if (position) {
      this.positions.set(coin, { ...position, currentPrice })
    }
  }

  updateStopLoss(coin: string, stopLoss: number): void {
    const position = this.positions.get(coin)
    if (position) {
      this.positions.set(coin, { ...position, stopLoss })
    }
  }

}
