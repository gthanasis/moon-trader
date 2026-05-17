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

  /**
   * Adds to an existing position, recomputing total size and the
   * volume-weighted average entry price. No-op when the position does not
   * exist or the inputs are non-positive.
   */
  scaleIn(coin: string, addedSize: number, fillPrice: number): void {
    const position = this.positions.get(coin)
    if (!position || addedSize <= 0 || fillPrice <= 0) return
    const oldQty = position.entryPrice > 0 ? position.size / position.entryPrice : 0
    const addedQty = addedSize / fillPrice
    const newSize = position.size + addedSize
    const newQty = oldQty + addedQty
    const newEntryPrice = newQty > 0 ? newSize / newQty : position.entryPrice
    this.positions.set(coin, { ...position, size: newSize, entryPrice: newEntryPrice })
  }

}
