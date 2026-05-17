import type { Trade, Narration, NarrationStats, NarrationGranularity } from '../common'
import type { StoredDecision } from '../prisma/repositories/decision.repository'

export interface NarrationPrompt {
  system: string
  user: string
}

const SYSTEM = `You explain a crypto trading bot's activity to a non-technical person watching a dashboard.
Be concise, plain-spoken, and concrete. Avoid jargon. Never give financial advice.
Reply ONLY with a JSON object of the form:
{"summary": "<2-4 sentences on what happened>", "assessment": "<1-2 sentences judging whether the bot behaved sensibly>"}`

function fmtUsd(n: number): string {
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

/** Builds the LLM prompt for a finest-level (6h) narration block. */
export function buildBlockPrompt(input: {
  granularity: NarrationGranularity
  periodStart: Date
  periodEnd: Date
  trades: Trade[]
  decisions: StoredDecision[]
  stats: NarrationStats
}): NarrationPrompt {
  const { periodStart, periodEnd, trades, decisions, stats } = input

  const tradeLines = trades.length
    ? trades
        .map(t => `- ${t.coin} ${t.side} $${t.size.toFixed(0)} → ${t.pnl != null ? fmtUsd(t.pnl) : 'open'}`)
        .join('\n')
    : '(no trades closed)'

  const decisionLines = decisions.length
    ? decisions
        .map(d => {
          const tag = d.status === 'blocked' ? ` [blocked: ${d.blockedReason ?? '?'}]` : ''
          return `- ${d.action.toUpperCase()} ${d.coin} (confidence ${(d.confidence * 100).toFixed(0)}%)${tag}: ${d.reasoning}`
        })
        .join('\n')
    : '(no decisions)'

  const user = `Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}

Realised stats:
- Net P&L: ${fmtUsd(stats.pnl)}
- Benchmark: buy-and-hold BTC ${fmtPct(stats.benchmarkReturn)} over the period — bot alpha ${fmtPct(stats.alpha)}
- Trades closed: ${stats.trades} (${stats.wins} wins, ${stats.losses} losses)
- Win rate: ${(stats.winRate * 100).toFixed(0)}%

Trades closed this period:
${tradeLines}

Decisions the bot made this period:
${decisionLines}

Write the JSON narration for this period.`

  return { system: SYSTEM, user }
}

/**
 * Builds the LLM prompt for a roll-up narration (day/week/month), summarising
 * the child-period narrations rather than raw trades.
 */
export function buildRollupPrompt(input: {
  granularity: NarrationGranularity
  periodStart: Date
  periodEnd: Date
  children: Narration[]
  stats: NarrationStats
}): NarrationPrompt {
  const { granularity, periodStart, periodEnd, children, stats } = input

  const childLines = children
    .map(c => `- ${c.periodStart.toISOString()} (${c.granularity}): ${c.summary}`)
    .join('\n')

  const user = `You are writing a ${granularity} recap by summarising its sub-period narrations.

Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}

Totals for the whole period:
- Net P&L: ${fmtUsd(stats.pnl)}
- Benchmark: buy-and-hold BTC ${fmtPct(stats.benchmarkReturn)} over the period — bot alpha ${fmtPct(stats.alpha)}
- Trades closed: ${stats.trades} (${stats.wins} wins, ${stats.losses} losses)
- Win rate: ${(stats.winRate * 100).toFixed(0)}%

Sub-period narrations:
${childLines || '(none)'}

Write the JSON narration summarising this whole ${granularity}.`

  return { system: SYSTEM, user }
}
