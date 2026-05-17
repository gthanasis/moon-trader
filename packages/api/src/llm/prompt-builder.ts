import type { TradingContext, Candle, FeatureSet, PromptPlaceholderName } from '../common'
import { DEFAULT_STRATEGY_PROMPT, DEFAULT_PROMPT_TEMPLATE, CORE_SYSTEM_RULES } from '../common'
import { computeFeatures } from './features'

/** Compact inline indicator string embedded next to each coin's price candles. */
function formatIndicators(f: FeatureSet): string {
  const ema20str = `EMA20${f.ema20Distance >= 0 ? '+' : ''}${f.ema20Distance.toFixed(1)}%`
  const ema50str = `EMA50${f.ema50Distance >= 0 ? '+' : ''}${f.ema50Distance.toFixed(1)}%`
  return `RSI(14)=${f.rsi14.toFixed(1)} ATR(14)=${f.atr14.toFixed(1)} ` +
    `vol=${(f.realisedVol * 100).toFixed(1)}% ${ema20str} ${ema50str} trend=${f.trend} ` +
    `volZ=${f.volumeZScore.toFixed(2)}`
}

function computeIndicators(candles: Candle[]): string {
  const features = computeFeatures(candles)
  return features ? formatIndicators(features) : 'insufficient data'
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

/** Structured one-line-per-coin block of the deterministic feature set. */
function renderFeatures(ctx: TradingContext): string {
  const ohlcv = ctx.snapshot.ohlcv
  const coins = Object.keys(ohlcv)
  if (coins.length === 0) return 'No feature data available'
  return coins
    .map(coin => {
      const f = computeFeatures(ohlcv[coin])
      if (!f) return `${coin}: insufficient data`
      const ema20 = `${f.ema20Distance >= 0 ? '+' : ''}${f.ema20Distance.toFixed(1)}%`
      const ema50 = `${f.ema50Distance >= 0 ? '+' : ''}${f.ema50Distance.toFixed(1)}%`
      const window = `${f.windowReturn >= 0 ? '+' : ''}${f.windowReturn.toFixed(2)}%`
      return `${coin}: RSI ${f.rsi14.toFixed(1)} | trend ${f.trend} | EMA20 ${ema20} | ` +
        `EMA50 ${ema50} | ATR ${f.atr14.toFixed(1)} | vol ${(f.realisedVol * 100).toFixed(1)}% | ` +
        `volZ ${f.volumeZScore.toFixed(2)} | window ${window}`
    })
    .join('\n')
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
  features: renderFeatures,
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
