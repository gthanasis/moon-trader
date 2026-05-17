/** One predicted-confidence/realised-outcome pair from a closed trade. */
export interface ConfidenceOutcome {
  /** The LLM's predicted confidence on the decision that opened the trade. */
  confidence: number
  /** Realised PnL of the closed trade, in USD. */
  pnl: number
}

/**
 * One confidence bucket of the calibration curve: how the bot's *predicted*
 * confidence in a band compares to the *realised* win rate of those trades.
 */
export interface CalibrationBucket {
  /** Human label for the confidence band, e.g. "0.7–0.8". */
  range: string
  /** Band midpoint — the representative predicted confidence. */
  predictedConfidence: number
  /** Number of closed trades in the band. */
  n: number
  /** Realised win rate (pnl > 0) of trades in the band. */
  realisedWinRate: number
  /** Average realised PnL of trades in the band, in USD. */
  avgPnl: number
  /** True when `n` is too small to read anything into the band. */
  insufficient: boolean
}
