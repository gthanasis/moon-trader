/** Granularity levels of the narration hierarchy, finest to coarsest. */
export type NarrationGranularity = '6h' | 'day' | 'week' | 'month'

/** Aggregate trading stats for a narration period. */
export interface NarrationStats {
  pnl: number
  trades: number
  wins: number
  losses: number
  winRate: number
}

/**
 * A plain-language recap of one period of bot activity. Narrations form a
 * hierarchy: a `day` summarises its `6h` children, a `week` its `day`s, etc.
 */
export interface Narration {
  id: string
  granularity: NarrationGranularity
  periodStart: Date
  periodEnd: Date
  /** LLM-written recap of what happened in the period. */
  summary: string
  /** Brief judgement of whether the bot behaved sensibly. */
  assessment: string | null
  stats: NarrationStats
  createdAt: Date
}

/** The granularity one level finer than the given one, or null for the finest. */
export const CHILD_GRANULARITY: Record<NarrationGranularity, NarrationGranularity | null> = {
  month: 'week',
  week: 'day',
  day: '6h',
  '6h': null,
}
