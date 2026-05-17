import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LiquidationCollector, type LiquidationSocket, type SocketFactory, type LiquidationEvent } from '../../../src/market-data/sources/liquidation-collector'
import { LiquidationSource } from '../../../src/market-data/sources/liquidation.source'
import type { LiquidationCollector as Collector } from '../../../src/market-data/sources/liquidation-collector'

/** A controllable in-memory socket — tests drive open/message/close by hand. */
class FakeSocket implements LiquidationSocket {
  private readonly handlers = new Map<string, ((data?: unknown) => void)[]>()
  closed = false

  on(event: string, listener: (data?: unknown) => void): void {
    const list = this.handlers.get(event) ?? []
    list.push(listener)
    this.handlers.set(event, list)
  }

  close(): void {
    this.closed = true
    this.emit('close')
  }

  emit(event: string, data?: unknown): void {
    for (const h of this.handlers.get(event) ?? []) h(data)
  }
}

/** A socket factory that records every socket it hands out. */
function recordingFactory(): { factory: SocketFactory; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = []
  return {
    sockets,
    factory: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
  }
}

/** Serialised Binance `forceOrder` frame. */
function forceOrder(symbol: string, side: 'SELL' | 'BUY', qty: number, price: number, T = Date.now()): string {
  return JSON.stringify({ e: 'forceOrder', E: T, o: { s: symbol, S: side, q: String(qty), p: String(price), ap: String(price), T } })
}

describe('LiquidationCollector', () => {
  it('opens a socket on start', () => {
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], socketFactory: factory })
    collector.start()
    expect(sockets).toHaveLength(1)
    collector.stop()
  })

  it('start is idempotent — a second call opens no extra socket', () => {
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], socketFactory: factory })
    collector.start()
    collector.start()
    expect(sockets).toHaveLength(1)
    collector.stop()
  })

  it('buffers a liquidation for a traded coin, mapping a forced SELL to a long', () => {
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], socketFactory: factory })
    collector.start()
    sockets[0].emit('message', forceOrder('BTCUSDT', 'SELL', 2, 50000))

    const window = collector.getWindow()
    expect(window).toHaveLength(1)
    expect(window[0].coin).toBe('BTC/USDT')
    expect(window[0].side).toBe('long')
    expect(window[0].notional).toBe(100000) // 2 × 50000
    collector.stop()
  })

  it('maps a forced BUY to a short liquidation', () => {
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], socketFactory: factory })
    collector.start()
    sockets[0].emit('message', forceOrder('BTCUSDT', 'BUY', 1, 50000))
    expect(collector.getWindow()[0].side).toBe('short')
    collector.stop()
  })

  it('ignores liquidations for coins it does not track', () => {
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], socketFactory: factory })
    collector.start()
    sockets[0].emit('message', forceOrder('DOGEUSDT', 'SELL', 100, 0.1))
    expect(collector.getWindow()).toHaveLength(0)
    collector.stop()
  })

  it('ignores malformed frames without throwing', () => {
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], socketFactory: factory })
    collector.start()
    expect(() => {
      sockets[0].emit('message', 'not json')
      sockets[0].emit('message', JSON.stringify({ e: 'somethingElse' }))
    }).not.toThrow()
    expect(collector.getWindow()).toHaveLength(0)
    collector.stop()
  })

  it('prunes liquidations older than the rolling window', () => {
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], windowMs: 1000, socketFactory: factory })
    collector.start()
    sockets[0].emit('message', forceOrder('BTCUSDT', 'SELL', 1, 50000, Date.now() - 5000)) // stale
    sockets[0].emit('message', forceOrder('BTCUSDT', 'SELL', 1, 50000, Date.now())) // fresh
    const window = collector.getWindow()
    expect(window).toHaveLength(1)
    collector.stop()
  })

  it('reconnects after the connection drops', () => {
    vi.useFakeTimers()
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], reconnectMs: 1000, socketFactory: factory })
    collector.start()
    sockets[0].emit('close')
    expect(sockets).toHaveLength(1) // not yet
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2) // reconnected
    collector.stop()
    vi.useRealTimers()
  })

  it('does not reconnect after stop', () => {
    vi.useFakeTimers()
    const { factory, sockets } = recordingFactory()
    const collector = new LiquidationCollector({ coins: ['BTC/USDT'], reconnectMs: 1000, socketFactory: factory })
    collector.start()
    collector.stop()
    expect(sockets[0].closed).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(sockets).toHaveLength(1) // no reconnect
    vi.useRealTimers()
  })
})

describe('LiquidationSource', () => {
  const fakeCollector = (events: LiquidationEvent[]): Collector =>
    ({ getWindow: () => events }) as unknown as Collector

  const liq = (coin: string, side: 'long' | 'short', notional: number): LiquidationEvent =>
    ({ coin, side, notional, timestamp: new Date() })

  it('emits a per-coin summary of long and short notional liquidated', async () => {
    const source = new LiquidationSource(
      fakeCollector([liq('BTC/USDT', 'long', 300000), liq('BTC/USDT', 'short', 100000)]),
      ['BTC/USDT'],
    )
    const [signal] = await source.fetch()
    expect(signal.type).toBe('microstructure')
    expect(signal.coins).toEqual(['BTC/USDT'])
    expect(signal.content).toContain('$400,000 total')
    expect(signal.content).toContain('$300,000 longs')
    expect(signal.content).toContain('$100,000 shorts')
  })

  it('flags a cascade when many liquidations cluster', async () => {
    const events = Array.from({ length: 6 }, () => liq('BTC/USDT', 'long', 10000))
    const [signal] = await new LiquidationSource(fakeCollector(events), ['BTC/USDT']).fetch()
    expect(signal.content).toContain('cascade in progress')
  })

  it('does not flag a cascade for a handful of liquidations', async () => {
    const events = [liq('BTC/USDT', 'long', 10000), liq('BTC/USDT', 'short', 10000)]
    const [signal] = await new LiquidationSource(fakeCollector(events), ['BTC/USDT']).fetch()
    expect(signal.content).not.toContain('cascade')
  })

  it('emits no signal for a coin with no liquidations in the window', async () => {
    const source = new LiquidationSource(fakeCollector([liq('BTC/USDT', 'long', 10000)]), ['BTC/USDT', 'ETH/USDT'])
    const signals = await source.fetch()
    expect(signals).toHaveLength(1)
    expect(signals[0].coins).toEqual(['BTC/USDT'])
  })

  it('yields no signals when the buffer is empty', async () => {
    const signals = await new LiquidationSource(fakeCollector([]), ['BTC/USDT']).fetch()
    expect(signals).toHaveLength(0)
  })

  it('returns no historical signals', async () => {
    const signals = await new LiquidationSource(fakeCollector([]), ['BTC/USDT']).fetchHistorical(new Date(0), new Date())
    expect(signals).toHaveLength(0)
  })
})
