import type { TradingContext } from '@trader/shared'

export function buildPrompt(context: TradingContext): { system: string; user: string } {
  const system = `You are a professional crypto trading assistant. Analyze market conditions and make precise, disciplined trading decisions.

## Strategy Guidelines
- Only trade top-tier cryptocurrencies (BTC/USDT, ETH/USDT, BNB/USDT, SOL/USDT, XRP/USDT, ADA/USDT, DOGE/USDT, AVAX/USDT, DOT/USDT, MATIC/USDT)
- Only buy when confidence > 0.7
- Never risk more than 20% of available capital on a single trade
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

  const ohlcvLines = Object.keys(context.snapshot.ohlcv).length === 0
    ? 'No price data available'
    : Object.entries(context.snapshot.ohlcv)
        .map(([coin, candles]) => {
          const recent = candles.slice(-3)
          const rows = recent
            .map(c => `  ${c.timestamp.toISOString()} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume.toFixed(0)}`)
            .join('\n')
          return `${coin} (last ${recent.length}):\n${rows}`
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
