import { describe, it, expect } from 'vitest'
import { formatUsd, formatPct, formatDuration } from '../lib/format'

describe('formatUsd', () => {
  it('formats positive value with dollar sign and two decimals', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
  })

  it('formats zero', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('formats negative value', () => {
    expect(formatUsd(-99.9)).toBe('-$99.90')
  })
})

describe('formatPct', () => {
  it('formats positive percentage', () => {
    expect(formatPct(12.345)).toBe('+12.35%')
  })

  it('formats negative percentage', () => {
    expect(formatPct(-5.1)).toBe('-5.10%')
  })

  it('formats zero', () => {
    expect(formatPct(0)).toBe('+0.00%')
  })
})

describe('formatDuration', () => {
  it('returns hours and minutes for durations under a day', () => {
    expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m')
  })

  it('returns days and hours for durations over a day', () => {
    expect(formatDuration(25 * 60 * 60 * 1000)).toBe('1d 1h')
  })

  it('returns "< 1m" for very short durations', () => {
    expect(formatDuration(30000)).toBe('< 1m')
  })
})
