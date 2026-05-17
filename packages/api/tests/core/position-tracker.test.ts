import { describe, it, expect, beforeEach } from 'vitest'
import { PositionTracker } from '../../src/core/position-tracker'

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

  it('scales into a position, recomputing size and a volume-weighted entry', () => {
    tracker.open({ coin: 'BTC/USDT', size: 100, entryPrice: 50000, currentPrice: 50000 })
    tracker.scaleIn('BTC/USDT', 60, 60000)
    const p = tracker.get('BTC/USDT')!
    // 0.002 BTC @50000 + 0.001 BTC @60000 = 0.003 BTC for $160 → avg entry 53333.33
    expect(p.size).toBe(160)
    expect(p.entryPrice).toBeCloseTo(53333.33, 1)
  })

  it('ignores scaleIn for a non-existent position', () => {
    tracker.scaleIn('SOL/USDT', 50, 100)
    expect(tracker.get('SOL/USDT')).toBeUndefined()
  })

})
