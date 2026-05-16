import { describe, it, expect, beforeEach } from 'vitest'
import { PositionTracker } from '../src/position-tracker.js'

describe('PositionTracker', () => {
  let tracker: PositionTracker

  beforeEach(() => {
    tracker = new PositionTracker()
  })

  it('starts with no positions', () => {
    expect(tracker.getAll()).toHaveLength(0)
  })

  it('opens a position', () => {
    tracker.open({ coin: 'BTC/USDT', size: 100, entryPrice: 50000, currentPrice: 50000 })
    expect(tracker.getAll()).toHaveLength(1)
    expect(tracker.get('BTC/USDT')).toBeDefined()
  })

  it('updates current price', () => {
    tracker.open({ coin: 'BTC/USDT', size: 100, entryPrice: 50000, currentPrice: 50000 })
    tracker.updatePrice('BTC/USDT', 55000)
    expect(tracker.get('BTC/USDT')?.currentPrice).toBe(55000)
  })

  it('closes a position and returns it', () => {
    tracker.open({ coin: 'ETH/USDT', size: 200, entryPrice: 3000, currentPrice: 3000 })
    const closed = tracker.close('ETH/USDT')
    expect(closed?.coin).toBe('ETH/USDT')
    expect(tracker.get('ETH/USDT')).toBeUndefined()
  })

  it('returns undefined when closing non-existent position', () => {
    expect(tracker.close('SOL/USDT')).toBeUndefined()
  })

})
