import { describe, it, expect } from 'vitest'
import { BacktestService } from '../../src/backtest/backtest.service'

/** parseParams is pure — exercise it without DB dependencies. */
const service = new BacktestService(null as never, null as never, null as never, null as never)

describe('BacktestService.parseParams', () => {
  it('rejects missing from/to', () => {
    expect(service.parseParams({})).toEqual({ ok: false, error: 'Missing required params: from, to' })
  })

  it('rejects from >= to', () => {
    const r = service.parseParams({ from: '2026-02-01', to: '2026-01-01' })
    expect(r.ok).toBe(false)
  })

  it('defaults coins, model, capital and interval', () => {
    const r = service.parseParams({ from: '2026-01-01', to: '2026-02-01' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.params.coins).toEqual(['BTC/USDT', 'ETH/USDT'])
    expect(r.params.model).toBe('gpt-4o-mini')
    expect(r.params.initialCapital).toBe(1000)
    expect(r.params.intervalMs).toBe(60 * 60 * 1000)
  })

  it('parses coins as a comma-separated list and rejects > 10', () => {
    const ok = service.parseParams({ from: '2026-01-01', to: '2026-02-01', coins: 'BTC/USDT, ETH/USDT' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.params.coins).toEqual(['BTC/USDT', 'ETH/USDT'])

    const tooMany = service.parseParams({
      from: '2026-01-01',
      to: '2026-02-01',
      coins: Array.from({ length: 11 }, (_, i) => `C${i}`).join(','),
    })
    expect(tooMany.ok).toBe(false)
  })

  it('rejects non-positive initialCapital', () => {
    const r = service.parseParams({ from: '2026-01-01', to: '2026-02-01', initialCapital: '0' })
    expect(r.ok).toBe(false)
  })
})
