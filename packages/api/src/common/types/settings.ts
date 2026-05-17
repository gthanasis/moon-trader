/**
 * Runtime-editable bot settings. Stored in the BotState table under the
 * `settings` key and re-read by the live runner at the start of every cycle,
 * so changes take effect without restarting the process.
 *
 * Restart-only config (API keys, coins, timeframe) stays in .env and is
 * intentionally NOT part of this type.
 */
export interface BotSettings {
  /**
   * Editable strategy/persona text prepended to the system prompt. The locked
   * core rules (coin whitelist, stop-loss mandate, decision tool) are always
   * appended after this, so the basics survive any edit.
   */
  strategyPrompt: string
  /**
   * Editable user-message template. `{placeholder}` tokens from
   * PROMPT_PLACEHOLDERS are substituted with live data each cycle; unknown
   * tokens are left as literal text.
   */
  promptTemplate: string
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

/** Numeric settings keys — everything in BotSettings except the booleans and prompt strings. */
export type NumericSettingKey = Exclude<keyof BotSettings, 'paperMode' | 'strategyPrompt' | 'promptTemplate'>

/** Prompt-string settings keys. */
export type PromptSettingKey = 'strategyPrompt' | 'promptTemplate'

/** Maximum length (characters) accepted for each editable prompt string. */
export const PROMPT_MAX_LENGTH = 8000

/**
 * Placeholders the prompt template understands. The web settings UI renders
 * these as draggable chips; prompt-builder maps each name to a renderer.
 */
export const PROMPT_PLACEHOLDERS = [
  { name: 'capital', description: 'Available capital in USD' },
  { name: 'positions', description: 'Open positions with unrealized P&L' },
  { name: 'prices', description: 'Recent candles + indicators per coin' },
  { name: 'signals', description: 'Recent news / sentiment / macro signals' },
  { name: 'trades', description: 'Most recent trades with P&L' },
  { name: 'openOrders', description: 'Currently open (unfilled) orders' },
  { name: 'narration6h', description: "Bot's own recap of the last 6 hours" },
  { name: 'narrationDay', description: "Bot's own recap of the past day" },
  { name: 'narrationWeek', description: "Bot's own recap of the past week" },
  { name: 'narrationMonth', description: "Bot's own recap of the past month" },
] as const

export type PromptPlaceholderName = (typeof PROMPT_PLACEHOLDERS)[number]['name']

/**
 * Locked rules always appended to the system prompt after the user-editable
 * strategy text. These guarantee the trading basics survive any prompt edit —
 * the coin whitelist, the stop-loss mandate, and the decision tool contract.
 * Surfaced read-only in the settings UI so the user sees what is enforced.
 */
export const CORE_SYSTEM_RULES = `## Core Rules (enforced by the engine — do not contradict)
- Only trade these pairs: BTC/USDT, ETH/USDT, BNB/USDT, SOL/USDT, XRP/USDT, ADA/USDT, DOGE/USDT, AVAX/USDT, DOT/USDT, MATIC/USDT
- Always include a stop-loss price for every buy — buys without one are rejected
- A minimum confidence threshold gates buys; when uncertain, choose hold
- Use the make_trading_decision tool once per coin you have a view on — evaluate every coin in the price data independently and submit a separate decision for each, using 'hold' for any coin you would not trade this cycle`

/** Editable strategy text. The locked core rules are appended after this. */
export const DEFAULT_STRATEGY_PROMPT = `You are a professional crypto trading assistant. Analyze market conditions and make precise, disciplined trading decisions.

## Strategy Guidelines
- Consider macro conditions — avoid buying during extreme fear unless the signal is very strong
- Favour high-conviction setups; position sizing is enforced by the engine based on risk parameters
- When uncertain, choose hold`

/**
 * Editable user-message template. The default is deliberately complete — it
 * wires in every data point the bot can see, so a fresh install gets the full
 * picture and the user can trim placeholders out rather than hunt for them.
 */
export const DEFAULT_PROMPT_TEMPLATE = `## Current State
Available capital: {capital}

## Open Positions
{positions}

## Open Orders
{openOrders}

## Price Data (recent candles)
{prices}

## Recent Signals (most recent first)
{signals}

## Recent Trades
{trades}

## Your Recent Activity Recaps
### Last 6 hours
{narration6h}
### Past day
{narrationDay}
### Past week
{narrationWeek}
### Past month
{narrationMonth}

Analyze the above and submit your trading decision.`

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  strategyPrompt: DEFAULT_STRATEGY_PROMPT,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
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

/** Everything in BotSettings a strategy preset configures — all but `paperMode`. */
export type PresetSettings = Omit<BotSettings, 'paperMode'>

/**
 * A named, ready-made strategy: a full prompt + parameter bundle the user can
 * apply from the settings UI as a starting point. `paperMode` is intentionally
 * excluded — switching to real money is always a deliberate, separate action.
 */
export interface StrategyPreset {
  id: string
  /** Display name, shown uppercased in the UI. */
  name: string
  /** One-line hook describing the trading style. */
  tagline: string
  /** A short paragraph on how the strategy behaves and who it suits. */
  description: string
  settings: PresetSettings
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'boring-trader',
    name: 'The Boring Trader',
    tagline: 'Patient, long-horizon. Compounds slowly, avoids mistakes.',
    description:
      'Trades only BTC and ETH, twice a day, and only when the trend is clearly up. Holds cash in choppy markets and rarely acts — the goal is to avoid bad trades, not catch every move. The safest starting point.',
    settings: {
      runIntervalMinutes: 720,
      minConfidence: 0.78,
      riskPerTradePct: 0.01,
      maxPositions: 3,
      dailyLossLimitPct: 0.03,
      autoTradeLimit: 50,
      strategyPrompt: `You are a patient, long-horizon crypto trader. You are not here to catch every move — you are here to compound slowly and avoid mistakes.

## Strategy Guidelines
- Trade only BTC/USDT and ETH/USDT. Ignore smaller, noisier coins.
- Only buy when the trend is clearly up (price above EMA20 and EMA50) and momentum is healthy (RSI roughly 45–65).
- Skip choppy, directionless markets — holding cash is a valid, often correct position.
- Avoid buying into extreme greed or extreme fear; wait for calm.
- Once in a position, give it room — do not micromanage. Let the trailing stop do its work.
- When in any doubt, choose hold. Missing a trade costs nothing; a bad trade costs real money.`,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    },
  },
  {
    id: 'momentum-rider',
    name: 'The Momentum Rider',
    tagline: 'Buys strength, sells weakness. Rides established trends.',
    description:
      'Checks the market hourly and enters coins in a strong, volume-confirmed uptrend. Cuts losers fast and lets winners run on the trailing stop. More active and more volatile than the Boring Trader.',
    settings: {
      runIntervalMinutes: 60,
      minConfidence: 0.65,
      riskPerTradePct: 0.02,
      maxPositions: 5,
      dailyLossLimitPct: 0.05,
      autoTradeLimit: 50,
      strategyPrompt: `You are a momentum trader. You buy strength and sell weakness — you never try to catch a falling knife.

## Strategy Guidelines
- Favour coins in a strong, established uptrend: price above EMA20 and EMA50, with EMA20 above EMA50.
- Prefer above-average volume (positive volume z-score) confirming the move.
- Enter on continuation, not exhaustion — avoid coins already up sharply with overbought RSI (>75).
- Cut losing trades quickly; let winners run via the trailing stop.
- A flat or downward trend is an automatic hold.`,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    },
  },
  {
    id: 'contrarian',
    name: 'The Contrarian',
    tagline: 'Buys quality coins when others panic. Mean reversion.',
    description:
      'Looks for oversold large-caps during fear and bets on the bounce. Sizes positions modestly because timing a bottom is imprecise. Best suited to volatile, washed-out markets.',
    settings: {
      runIntervalMinutes: 240,
      minConfidence: 0.7,
      riskPerTradePct: 0.015,
      maxPositions: 4,
      dailyLossLimitPct: 0.06,
      autoTradeLimit: 50,
      strategyPrompt: `You are a contrarian, mean-reversion trader. You buy quality coins when others panic.

## Strategy Guidelines
- Trade only large-cap coins (BTC, ETH, SOL, BNB) — they reliably recover; smaller coins may not.
- Look for oversold conditions: RSI below 35 and price stretched well below EMA20.
- Sentiment signals showing extreme fear are a tailwind for entries, not a warning.
- Size positions modestly — catching a bottom is imprecise, so leave room to be early.
- Take profit into strength; do not get greedy waiting for the exact top.
- If a coin is trending down with no oversold signal, hold and wait.`,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    },
  },
  {
    id: 'high-roller',
    name: 'The High Roller',
    tagline: 'Aggressive. Chases breakouts across every coin, accepts the swings.',
    description:
      'The risk-taker. Checks the market every 15 minutes, trades the full coin list, takes large positions on a low confidence bar, and runs many at once. Expect big swings — only sensible in paper mode or with money you can afford to lose.',
    settings: {
      runIntervalMinutes: 15,
      minConfidence: 0.5,
      riskPerTradePct: 0.05,
      maxPositions: 8,
      dailyLossLimitPct: 0.12,
      autoTradeLimit: 50,
      strategyPrompt: `You are an aggressive, high-conviction crypto trader. You are here to maximise upside — you accept volatility and the occasional sharp loss as the cost of catching big moves.

## Strategy Guidelines
- Trade the full coin list, including smaller, faster-moving coins — not just BTC and ETH.
- Act decisively on momentum and breakouts; a developing trend is enough, you do not need full confirmation.
- Volume spikes and strong sentiment shifts are buy signals, not warnings.
- Hold cash only when there is genuinely no setup — being in the market is the default.
- Cut a clearly broken trade fast, but give winners plenty of room to run.
- Bias toward action over caution: a missed move is a real cost.`,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    },
  },
]

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
    for (const key of ['strategyPrompt', 'promptTemplate'] as PromptSettingKey[]) {
      const val = obj[key]
      // Reject non-strings, empties and oversized blobs — fall back to default.
      if (typeof val === 'string' && val.trim().length > 0 && val.length <= PROMPT_MAX_LENGTH) {
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
