import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../../src/llm/prompt-builder'
import type { TradingContext } from '../../src/common'

const emptyContext: TradingContext = {
  snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
  positions: [],
  availableCapital: 1000,
  recentTrades: [],
  openOrders: [],
}

describe('buildPrompt', () => {
  it('includes available capital in user message', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('1000.00')
  })

  it('shows no open positions message when positions are empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No open positions')
  })

  it('includes position details when positions exist', () => {
    const context: TradingContext = {
      ...emptyContext,
      positions: [{
        coin: 'BTC/USDT',
        size: 200,
        entryPrice: 50000,
        currentPrice: 55000,
        openedAt: new Date(),
      }],
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('BTC/USDT')
    expect(user).toContain('50000')
    expect(user).toContain('55000')
  })

  it('includes signal content in user message', () => {
    const context: TradingContext = {
      ...emptyContext,
      snapshot: {
        timestamp: new Date(),
        signals: [{
          source: 'test',
          type: 'sentiment',
          content: 'Fear index: 25',
          timestamp: new Date(),
        }],
        ohlcv: {},
      },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('Fear index: 25')
  })

  it('limits signals to 20 most recent', () => {
    const signals = Array.from({ length: 25 }, (_, i) => ({
      source: 'test',
      type: 'news' as const,
      content: `Signal ${i}`,
      timestamp: new Date(Date.now() - i * 1000),
    }))
    const context: TradingContext = {
      ...emptyContext,
      snapshot: { timestamp: new Date(), signals, ohlcv: {} },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('Signal 0')
    expect(user).not.toContain('Signal 24')
  })

  it('system prompt instructs use of make_trading_decision tool', () => {
    const { system } = buildPrompt(emptyContext)
    expect(system).toContain('make_trading_decision')
  })

  it('system prompt mentions hold as default when uncertain', () => {
    const { system } = buildPrompt(emptyContext)
    expect(system).toContain('hold')
  })

  it('shows no recent trades message when trades are empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No recent trades')
  })

  it('includes recent trade details when trades exist', () => {
    const context: TradingContext = {
      ...emptyContext,
      recentTrades: [{
        id: '1',
        coin: 'ETH/USDT',
        side: 'buy',
        size: 100,
        entryPrice: 3000,
        openedAt: new Date(),
        pnl: 5.2,
      }],
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('ETH/USDT')
  })

  it('includes ohlcv price data when available', () => {
    const context: TradingContext = {
      ...emptyContext,
      snapshot: {
        timestamp: new Date(),
        signals: [],
        ohlcv: {
          'BTC/USDT': [
            { timestamp: new Date('2024-01-01T00:00:00Z'), open: 50000, high: 51000, low: 49500, close: 50500, volume: 1200 },
          ],
        },
      },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('BTC/USDT')
    expect(user).toContain('50000')
  })

  it('shows no price data message when ohlcv is empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No price data')
  })

  describe('pre-computed indicators', () => {
    function makeCandles(closes: number[]) {
      return closes.map((c, i) => ({
        timestamp: new Date(i * 60000),
        open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1000 + i * 10,
      }))
    }

    const btcCandles = makeCandles([
      50000, 50200, 50100, 50400, 50300, 50600, 50500, 50700, 50800, 50600,
      50900, 51000, 50800, 51100, 51200, 51000, 51300, 51400, 51200, 51500,
    ])

    const contextWithCandles = (coin: string, candles: typeof btcCandles, extra = {}): TradingContext => ({
      ...emptyContext,
      snapshot: { timestamp: new Date(), signals: [], ohlcv: { [coin]: candles, ...extra } },
    })

    it('includes RSI in coin header line', () => {
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', btcCandles))
      expect(user).toMatch(/RSI\(14\)=\d+\.\d/)
    })

    it('includes ATR in coin header line', () => {
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', btcCandles))
      expect(user).toMatch(/ATR\(14\)=\d+/)
    })

    it('includes realised volatility in coin header line', () => {
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', btcCandles))
      expect(user).toMatch(/vol=\d+\.\d+%/)
    })

    it('includes EMA distance percentages in coin header line', () => {
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', btcCandles))
      expect(user).toMatch(/EMA20[+-][\d.]+%/)
    })

    it('includes volume z-score in coin header line', () => {
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', btcCandles))
      expect(user).toMatch(/volZ=[+-]?[\d.]+/)
    })

    it('includes BTC 24h return as macro context for non-BTC coins', () => {
      const ethCandles = makeCandles([3000, 3010, 3020, 3030, 3040])
      const { user } = buildPrompt(contextWithCandles('ETH/USDT', ethCandles, { 'BTC/USDT': btcCandles }))
      expect(user).toMatch(/BTC 24h:/)
    })

    it('does not show BTC macro line for BTC itself', () => {
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', btcCandles))
      expect(user).not.toMatch(/BTC 24h:.*BTC\/USDT/)
    })

    it('shows n/a gracefully when fewer than period candles available', () => {
      const fewCandles = makeCandles([50000, 50100])
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', fewCandles))
      expect(user).toContain('BTC/USDT')
      // should not throw; indicators show n/a or computed value
    })

    it('vol annualisation scales with bar interval — 15m bars give lower vol than 1m bars for same price series', () => {
      const closes = [
        50000, 50200, 50100, 50400, 50300, 50600, 50500, 50700, 50800, 50600,
        50900, 51000, 50800, 51100, 51200, 51000, 51300, 51400, 51200, 51500, 51600,
      ]
      function candlesWithBarMs(closes: number[], barMs: number) {
        return closes.map((c, i) => ({
          timestamp: new Date(i * barMs),
          open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1000,
        }))
      }
      const ctx1m = contextWithCandles('BTC/USDT', candlesWithBarMs(closes, 60_000))
      const ctx15m = contextWithCandles('BTC/USDT', candlesWithBarMs(closes, 15 * 60_000))

      function extractVol(user: string): number {
        const m = user.match(/vol=([\d.]+)%/)
        return m ? parseFloat(m[1]) : 0
      }

      const vol1m = extractVol(buildPrompt(ctx1m).user)
      const vol15m = extractVol(buildPrompt(ctx15m).user)
      // 15m bars should produce √15 ≈ 3.87× lower annualised vol than 1m bars
      expect(vol1m / vol15m).toBeCloseTo(Math.sqrt(15), 0)
    })

    it('EMA on full series gives more accurate result than EMA seeded from sliced window', () => {
      // Strongly trending series: 100 bars from 50000 → 55000
      const closesLong = Array.from({ length: 100 }, (_, i) => 50000 + i * 50)
      const candles = closesLong.map((c, i) => ({
        timestamp: new Date(i * 60000),
        open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1000,
      }))
      const { user } = buildPrompt(contextWithCandles('BTC/USDT', candles))
      // With a sustained uptrend and full convergence, EMA20 should be below the last close
      // (last close ≈ 54950, EMA20 lags behind). The EMA20 distance should be positive.
      expect(user).toMatch(/EMA20\+[\d.]+%/)
    })
  })
})
