/**
 * Runtime-editable bot settings. Stored in the BotState table under the
 * `settings` key and re-read by the live runner at the start of every cycle,
 * so changes take effect without restarting the process.
 *
 * Restart-only config (API keys, coins, timeframe) stays in .env and is
 * intentionally NOT part of this type.
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
  /**
   * When true the bot simulates fills instead of placing real orders.
   * Default: true (paper). The trading loop re-reads this every cycle and
   * flips the order manager in place, so no restart is needed.
   */
  paperMode: boolean
}

/** Numeric settings keys — everything in BotSettings except the booleans. */
export type NumericSettingKey = Exclude<keyof BotSettings, 'paperMode'>

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  runIntervalMinutes: 60,
  minConfidence: 0.6,
  riskPerTradePct: 0.01,
  maxPositions: 5,
  dailyLossLimitPct: 0.05,
  autoTradeLimit: 50,
  paperMode: true,
}

/** Inclusive bounds enforced by both the web form and the server action. */
export const BOT_SETTINGS_BOUNDS: Record<NumericSettingKey, { min: number; max: number }> = {
  runIntervalMinutes: { min: 1, max: 1440 },
  minConfidence: { min: 0, max: 1 },
  riskPerTradePct: { min: 0.001, max: 1 },
  maxPositions: { min: 1, max: 50 },
  dailyLossLimitPct: { min: 0.005, max: 1 },
  autoTradeLimit: { min: 0, max: 1_000_000 },
}

/**
 * Merges a partial/untrusted value (e.g. a JSON blob from the DB) onto the
 * defaults. Numeric fields are dropped unless finite and within bounds;
 * `paperMode` is dropped unless it is a boolean.
 */
export function normalizeBotSettings(raw: unknown): BotSettings {
  const result: BotSettings = { ...DEFAULT_BOT_SETTINGS }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of Object.keys(BOT_SETTINGS_BOUNDS) as NumericSettingKey[]) {
      const val = obj[key]
      const { min, max } = BOT_SETTINGS_BOUNDS[key]
      if (typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max) {
        result[key] = val
      }
    }
    if (typeof obj['paperMode'] === 'boolean') result.paperMode = obj['paperMode']
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
