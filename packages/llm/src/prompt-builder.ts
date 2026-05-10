import type { TradingContext, Candle } from '@trader/shared'

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0
  const k = 2 / (period + 1)
  let result = values[0]
  for (let i = 1; i < values.length; i++) result = values[i] * k + result * (1 - k)
  return result
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    if (delta > 0) gains += delta
    else losses -= delta
  }
  if (losses === 0) return 100
  const rs = gains / losses
  return 100 - 100 / (1 + rs)
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)))
  }
  const slice = trs.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

function realisedVol(candles: Candle[], period = 20): number {
  if (candles.length < period + 1) return 0
  const slice = candles.slice(-period - 1)
  const closes = slice.map(c => c.close)
  const logReturns = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1)
  // Derive bar length from adjacent timestamps so annualisation is timeframe-agnostic.
  const barMs = candles[candles.length - 1].timestamp.getTime() - candles[candles.length - 2].timestamp.getTime()
  const barsPerYear = (365.25 * 24 * 3600 * 1000) / Math.max(barMs, 1)
  return Math.sqrt(variance * barsPerYear)
}

function volZScore(volumes: number[], period = 20): number {
  if (volumes.length < period + 1) return 0
  const slice = volumes.slice(-period)
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length)
  if (std === 0) return 0
  return (volumes[volumes.length - 1] - mean) / std
}

function computeIndicators(candles: Candle[]): string {
  if (candles.length < 2) return 'insufficient data'
  const closes = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const lastClose = closes[closes.length - 1]

  const rsi14 = rsi(closes).toFixed(1)

  const ema20val = ema(closes, 20)
  const ema50val = ema(closes, 50)
  const ema20dist = ((lastClose - ema20val) / ema20val * 100)
  const ema50dist = ((lastClose - ema50val) / ema50val * 100)
  const ema20str = `EMA20${ema20dist >= 0 ? '+' : ''}${ema20dist.toFixed(1)}%`
  const ema50str = `EMA50${ema50dist >= 0 ? '+' : ''}${ema50dist.toFixed(1)}%`

  const atr14 = atr(candles).toFixed(1)
  const vol = (realisedVol(candles) * 100).toFixed(1)
  const volZ = volZScore(volumes).toFixed(2)
  const trend = ema20val > ema50val ? 'bullish' : 'bearish'

  return `RSI(14)=${rsi14} ATR(14)=${atr14} vol=${vol}% ${ema20str} ${ema50str} trend=${trend} volZ=${volZ}`
}

export function buildPrompt(context: TradingContext): { system: string; user: string } {
  const system = `You are a professional crypto trading assistant. Analyze market conditions and make precise, disciplined trading decisions.

## Strategy Guidelines
- Only trade top-tier cryptocurrencies (BTC/USDT, ETH/USDT, BNB/USDT, SOL/USDT, XRP/USDT, ADA/USDT, DOGE/USDT, AVAX/USDT, DOT/USDT, MATIC/USDT)
- The engine enforces a minimum confidence threshold before executing buys; when uncertain, choose hold
- Position sizing is enforced by the engine based on risk parameters
- Always include a stop-loss level for buy orders
- Consider macro conditions — avoid buying during extreme fear unless signal is very strong
- When uncertain, choose hold

## Decision Tool
Use the make_trading_decision tool to submit exactly one decision per analysis cycle.`

  const positionLines = context.positions.length === 0
    ? 'No open positions'
    : context.positions
        .map(p => {
          const pct = ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
          return `- ${p.coin}: $${p.size.toFixed(2)} at $${p.entryPrice} (current: $${p.currentPrice}, ${pct.toFixed(1)}%)`
        })
        .join('\n')

  const btcCandles = context.snapshot.ohlcv['BTC/USDT']
  const btcMacro = (() => {
    if (!btcCandles || btcCandles.length < 2) return null
    const first = btcCandles[0].close, last = btcCandles[btcCandles.length - 1].close
    const pct = ((last - first) / first * 100)
    return `BTC 24h: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
  })()

  const ohlcvLines = Object.keys(context.snapshot.ohlcv).length === 0
    ? 'No price data available'
    : Object.entries(context.snapshot.ohlcv)
        .map(([coin, candles]) => {
          const recent = candles.slice(-20)
          const rows = recent
            .map(c => `  ${c.timestamp.toISOString()} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume.toFixed(0)}`)
            .join('\n')
          const indicators = computeIndicators(candles)
          const indicatorsLine = indicators === 'insufficient data' ? '' : ` — ${indicators}`
          const macro = coin !== 'BTC/USDT' && btcMacro ? `  [${btcMacro}]\n` : ''
          return `${coin}${indicatorsLine}\n${macro}${rows}`
        })
        .join('\n\n')

  const signalLines = context.snapshot.signals.length === 0
    ? 'No signals available'
    : context.snapshot.signals
        .slice(0, 20)
        .map(s => {
          const coins = s.coins ? ` [${s.coins.join(', ')}]` : ''
          return `[${s.timestamp.toISOString()}] [${s.type.toUpperCase()}]${coins} ${s.content}`
        })
        .join('\n')

  const tradeLines = context.recentTrades.length === 0
    ? 'No recent trades'
    : context.recentTrades
        .slice(0, 5)
        .map(t => {
          const pnl = t.pnl !== undefined ? ` P&L: ${t.pnl.toFixed(1)}%` : ''
          return `- ${t.side.toUpperCase()} ${t.coin}: $${t.size}${pnl}`
        })
        .join('\n')

  const user = `## Current State
Available capital: $${context.availableCapital.toFixed(2)}

## Open Positions
${positionLines}

## Price Data (recent candles)
${ohlcvLines}

## Recent Signals (most recent first)
${signalLines}

## Recent Trades
${tradeLines}

Analyze the above and submit your trading decision.`

  return { system, user }
}
