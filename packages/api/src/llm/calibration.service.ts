import { Injectable } from '@nestjs/common'
import type { CalibrationBucket, ConfidenceOutcome } from '../common'
import { DecisionRepository } from '../prisma/repositories/decision.repository'

/** Minimum closed trades in a band before its win rate means anything. */
const MIN_SAMPLE = 3
/** Lower bounds of the confidence bands; the last band runs to 1.0 inclusive. */
const BAND_LOWERS = [0.5, 0.6, 0.7, 0.8, 0.9]

/**
 * Pure: buckets predicted-confidence/realised-outcome pairs into a calibration
 * curve, so the bot can see whether its 0.8-confidence buys actually win 80%.
 */
export function bucketOutcomes(outcomes: ConfidenceOutcome[]): CalibrationBucket[] {
  return BAND_LOWERS.map((lo, i) => {
    const isTop = i === BAND_LOWERS.length - 1
    const hi = isTop ? 1 : BAND_LOWERS[i + 1]
    // The top band is inclusive of 1.0; others are half-open [lo, hi).
    const inBand = outcomes.filter(o => o.confidence >= lo && (isTop ? o.confidence <= 1.0001 : o.confidence < hi))
    const n = inBand.length
    const wins = inBand.filter(o => o.pnl > 0).length
    const totalPnl = inBand.reduce((sum, o) => sum + o.pnl, 0)
    return {
      range: `${lo.toFixed(1)}–${hi.toFixed(1)}`,
      predictedConfidence: lo + 0.05,
      n,
      realisedWinRate: n > 0 ? wins / n : 0,
      avgPnl: n > 0 ? totalPnl / n : 0,
      insufficient: n < MIN_SAMPLE,
    }
  })
}

/**
 * Computes the bot's confidence-calibration curve from closed trades joined to
 * the decisions that opened them. A persistent gap between predicted
 * confidence and realised win rate is a measurable, compounding learning signal.
 */
@Injectable()
export class CalibrationService {
  constructor(private readonly decisions: DecisionRepository) {}

  async compute(): Promise<CalibrationBucket[]> {
    const outcomes = await this.decisions.findConfidenceOutcomes()
    return bucketOutcomes(outcomes)
  }
}
