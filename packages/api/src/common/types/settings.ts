/**
 * Runtime-editable bot settings. Stored in the BotState table under the
 * `settings` key and re-read by the live runner at the start of every cycle,
 * so changes take effect without restarting the process.
 *
 * Restart-only config (API keys, coins, timeframe, paper mode) stays in .env
 * and is intentionally NOT part of this type.
 */
export interface BotSettings {
  /** How often the evaluation cycle runs, in minutes. Default: 60. */
  runIntervalMinutes: number
  /** Minimum LLM confidence for a non-hold decision to execute. Default: 0.6. */
  minConfidence: number
  /** Fraction of available capital risked per trade when a stop-loss is set. Default: 0.01 (1%). */
  riskPerTradePct: number
  /** Maximum simultaneous open positions. Default: 5. */
  maxPositions: number
  /** Fraction of day-start capital that may be lost before new buys are blocked. Default: 0.05 (5%). */
  dailyLossLimitPct: number
  /** Trade size (USD) at or below which the bot trades without manual approval. Default: 50. */
  autoTradeLimit: number
}

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  runIntervalMinutes: 60,
  minConfidence: 0.6,
  riskPerTradePct: 0.01,
  maxPositions: 5,
  dailyLossLimitPct: 0.05,
  autoTradeLimit: 50,
}

/** Inclusive bounds enforced by both the web form and the server action. */
export const BOT_SETTINGS_BOUNDS: Record<keyof BotSettings, { min: number; max: number }> = {
  runIntervalMinutes: { min: 1, max: 1440 },
  minConfidence: { min: 0, max: 1 },
  riskPerTradePct: { min: 0.001, max: 1 },
  maxPositions: { min: 1, max: 50 },
  dailyLossLimitPct: { min: 0.005, max: 1 },
  autoTradeLimit: { min: 0, max: 1_000_000 },
}

/**
 * Merges a partial/untrusted value (e.g. a JSON blob from the DB) onto the
 * defaults, dropping any field that is not a finite number within bounds.
 */
export function normalizeBotSettings(raw: unknown): BotSettings {
  const result: BotSettings = { ...DEFAULT_BOT_SETTINGS }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_BOT_SETTINGS) as (keyof BotSettings)[]) {
      const val = (raw as Record<string, unknown>)[key]
      const { min, max } = BOT_SETTINGS_BOUNDS[key]
      if (typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max) {
        result[key] = val
      }
    }
  }
  return result
}

/**
 * Converts a run interval in minutes to a node-cron expression.
 * Sub-hour intervals that divide 60 use `*​/N`; whole hours use `0 *​/H`;
 * everything else falls back to a per-minute step.
 */
export function intervalToCron(minutes: number): string {
  const m = Math.max(1, Math.round(minutes))
  if (m < 60) return `*/${m} * * * *`
  if (m % 60 === 0) {
    const hours = m / 60
    return hours === 1 ? '0 * * * *' : `0 */${hours} * * *`
  }
  return `*/${m} * * * *`
}
