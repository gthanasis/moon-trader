import type { TradingContext, Candle, PromptPlaceholderName } from '../common'
import { DEFAULT_STRATEGY_PROMPT, DEFAULT_PROMPT_TEMPLATE, CORE_SYSTEM_RULES } from '../common'

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

function renderCapital(ctx: TradingContext): string {
  return `$${ctx.availableCapital.toFixed(2)}`
}

function renderPositions(ctx: TradingContext): string {
  if (ctx.positions.length === 0) return 'No open positions'
  return ctx.positions
    .map(p => {
      const pct = ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
      return `- ${p.coin}: $${p.size.toFixed(2)} at $${p.entryPrice.toFixed(2)} (current: $${p.currentPrice.toFixed(2)}, ${pct.toFixed(1)}%)`
    })
    .join('\n')
}

function renderPrices(ctx: TradingContext): string {
  const ohlcv = ctx.snapshot.ohlcv
  if (Object.keys(ohlcv).length === 0) return 'No price data available'

  const btcCandles = ohlcv['BTC/USDT']
  const btcMacro = (() => {
    if (!btcCandles || btcCandles.length < 2) return null
    const first = btcCandles[0].close, last = btcCandles[btcCandles.length - 1].close
    const pct = ((last - first) / first * 100)
    return `BTC 24h: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
  })()

  return Object.entries(ohlcv)
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
}

function renderSignals(ctx: TradingContext): string {
  if (ctx.snapshot.signals.length === 0) return 'No signals available'
  return ctx.snapshot.signals
    .slice(0, 20)
    .map(s => {
      const coins = s.coins ? ` [${s.coins.join(', ')}]` : ''
      return `[${s.timestamp.toISOString()}] [${s.type.toUpperCase()}]${coins} ${s.content}`
    })
    .join('\n')
}

function renderTrades(ctx: TradingContext): string {
  if (ctx.recentTrades.length === 0) return 'No recent trades'
  return ctx.recentTrades
    .slice(0, 5)
    .map(t => {
      const pnl = t.pnl !== undefined ? ` P&L: ${t.pnl.toFixed(1)}%` : ''
      return `- ${t.side.toUpperCase()} ${t.coin}: $${t.size}${pnl}`
    })
    .join('\n')
}

function renderOpenOrders(ctx: TradingContext): string {
  const open = ctx.openOrders.filter(o => o.status === 'open')
  if (open.length === 0) return 'No open orders'
  return open
    .map(o => {
      const price = o.price !== undefined ? ` @ $${o.price.toFixed(2)}` : ' @ market'
      return `- ${o.side.toUpperCase()} ${o.coin}: $${o.size.toFixed(2)}${price}`
    })
    .join('\n')
}

/**
 * Builds a renderer for one narration window — the bot's own recap of what it
 * did over that period. Missing windows render as a short "no recap" line.
 */
function renderNarration(granularity: '6h' | 'day' | 'week' | 'month', label: string) {
  return (ctx: TradingContext): string => ctx.narrations?.[granularity] ?? `No ${label} recap available yet`
}

/** Placeholder name → renderer. Keys must match PROMPT_PLACEHOLDERS in settings. */
const PLACEHOLDERS: Record<PromptPlaceholderName, (ctx: TradingContext) => string> = {
  capital: renderCapital,
  positions: renderPositions,
  prices: renderPrices,
  signals: renderSignals,
  trades: renderTrades,
  openOrders: renderOpenOrders,
  narration6h: renderNarration('6h', 'last-6h'),
  narrationDay: renderNarration('day', 'past-day'),
  narrationWeek: renderNarration('week', 'past-week'),
  narrationMonth: renderNarration('month', 'past-month'),
}

/** Substitutes `{known}` tokens with live data; unknown tokens are left literal. */
function renderTemplate(template: string, context: TradingContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const render = PLACEHOLDERS[key as PromptPlaceholderName]
    return render ? render(context) : match
  })
}

export interface PromptOverrides {
  strategyPrompt: string
  promptTemplate: string
}

/**
 * Builds the system + user messages. `context.promptOverrides`, when present,
 * supplies the user-editable strategy text and template; otherwise the
 * defaults are used. CORE_SYSTEM_RULES is always appended to the system
 * message so the trading basics cannot be edited away.
 */
export function buildPrompt(context: TradingContext): { system: string; user: string } {
  const strategy = context.promptOverrides?.strategyPrompt ?? DEFAULT_STRATEGY_PROMPT
  const template = context.promptOverrides?.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE

  return {
    system: `${strategy}\n\n${CORE_SYSTEM_RULES}`,
    user: renderTemplate(template, context),
  }
}
