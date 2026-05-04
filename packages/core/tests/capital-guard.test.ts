import { describe, it, expect, beforeEach } from 'vitest'
import { CapitalGuard } from '../src/capital-guard.js'

describe('CapitalGuard', () => {
  let guard: CapitalGuard

  beforeEach(() => {
    guard = new CapitalGuard({ totalCapital: 1000 })
  })

  it('allows a trade that fits within available capital', () => {
    expect(guard.canTrade(200)).toBe(true)
  })

  it('rejects a trade that exceeds available capital', () => {
    expect(guard.canTrade(1100)).toBe(false)
  })

  it('tracks deployed capital after reserving', () => {
    guard.reserve(300)
    expect(guard.availableCapital()).toBe(700)
  })

  it('rejects if trade would exceed remaining capital', () => {
    guard.reserve(800)
    expect(guard.canTrade(300)).toBe(false)
  })

  it('releases capital on release()', () => {
    guard.reserve(500)
    guard.release(500)
    expect(guard.availableCapital()).toBe(1000)
  })

  it('does not release more than deployed', () => {
    guard.reserve(200)
    guard.release(500)
    expect(guard.availableCapital()).toBe(1000)
  })
})
