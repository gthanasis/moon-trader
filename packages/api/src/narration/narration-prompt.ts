import type { Trade, Narration, NarrationStats, NarrationGranularity, Lesson } from '../common'
import type { StoredDecision } from '../prisma/repositories/decision.repository'

export interface NarrationPrompt {
  system: string
  user: string
}

/**
 * The post-mortem critic. Its job is to find what went wrong and extract
 * falsifiable lessons — not to reassure. Judges against alpha, not raw P&L.
 */
const SYSTEM = `You are a hard-nosed trading-performance critic reviewing one period of a crypto bot's activity.
Your job is to find what the bot did WRONG and extract concrete, falsifiable lessons. You are not here to reassure.

Rules:
- Judge the period against ALPHA — the bot's return versus simply holding BTC. Raw profit is not success: a small gain while BTC ran far higher is a FAILURE, and a flat "cautious" period that trailed BTC is also a failure. Doing nothing is not free.
- Attribute every loss, and every bit of alpha left on the table, to a specific and falsifiable cause.
- A period with zero or negative alpha MUST yield at least one concrete lesson.
- Lessons must be specific and testable — e.g. "do not buy when RSI is above 70 in a choppy regime" — never vague advice like "be more careful".
- You are also given the lessons currently guiding the bot. For each, judge whether THIS period's evidence validated or contradicted it.

Reply ONLY with a JSON object:
{
  "summary": "<2-4 sentences: what happened and the blunt verdict>",
  "assessment": "<1-2 sentences judging performance against the BTC benchmark>",
  "lessons": [{"text": "<new falsifiable rule>", "category": "entry|exit|sizing|regime|risk|general"}],
  "lessonOutcomes": [{"text": "<exact text of an existing lesson>", "verdict": "validated|contradicted"}]
}`

function fmtUsd(n: number): string {
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

/** Renders the active lessons block the critic judges against. */
function renderActiveLessons(lessons: Lesson[]): string {
  if (lessons.length === 0) return '(no lessons yet)'
  return lessons
    .map(l => `- [${l.category}] ${l.text} (evidence: ${l.evidenceFor} for, ${l.evidenceAgainst} against)`)
    .join('\n')
}

/** Builds the LLM prompt for a finest-level (6h) narration block. */
export function buildBlockPrompt(input: {
  granularity: NarrationGranularity
  periodStart: Date
  periodEnd: Date
  trades: Trade[]
  decisions: StoredDecision[]
  stats: NarrationStats
  activeLessons: Lesson[]
}): NarrationPrompt {
  const { periodStart, periodEnd, trades, decisions, stats, activeLessons } = input

  const tradeLines = trades.length
    ? trades
        .map(t => `- ${t.coin} ${t.side} $${t.size.toFixed(0)} → ${t.pnl != null ? fmtUsd(t.pnl) : 'open'}`)
        .join('\n')
    : '(no trades closed)'

  const decisionLines = decisions.length
    ? decisions
        .map(d => {
          const tag = d.status === 'blocked' ? ` [blocked: ${d.blockedReason ?? '?'}]` : ''
          const regime = d.regime ? ` {${d.regime}}` : ''
          return `- ${d.action.toUpperCase()} ${d.coin}${regime} (confidence ${(d.confidence * 100).toFixed(0)}%)${tag}: ${d.reasoning}`
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

Lessons currently guiding the bot — judge each against this period:
${renderActiveLessons(activeLessons)}

Write the JSON critique for this period — include lessons for anything that went wrong or any alpha left on the table.`

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
  activeLessons: Lesson[]
}): NarrationPrompt {
  const { granularity, periodStart, periodEnd, children, stats, activeLessons } = input

  const childLines = children
    .map(c => `- ${c.periodStart.toISOString()} (${c.granularity}): ${c.summary}`)
    .join('\n')

  const user = `You are writing a ${granularity} critique by reviewing its sub-period narrations.

Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}

Totals for the whole period:
- Net P&L: ${fmtUsd(stats.pnl)}
- Benchmark: buy-and-hold BTC ${fmtPct(stats.benchmarkReturn)} over the period — bot alpha ${fmtPct(stats.alpha)}
- Trades closed: ${stats.trades} (${stats.wins} wins, ${stats.losses} losses)
- Win rate: ${(stats.winRate * 100).toFixed(0)}%

Sub-period narrations:
${childLines || '(none)'}

Lessons currently guiding the bot — judge each against this period:
${renderActiveLessons(activeLessons)}

Write the JSON critique summarising this whole ${granularity}.`

  return { system: SYSTEM, user }
}
