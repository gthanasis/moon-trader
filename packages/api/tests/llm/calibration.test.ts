import { describe, it, expect, vi } from 'vitest'
import { bucketOutcomes, CalibrationService } from '../../src/llm/calibration.service'
import type { DecisionRepository } from '../../src/prisma/repositories/decision.repository'

describe('bucketOutcomes', () => {
  it('produces a band for each confidence range from 0.5 to 1.0', () => {
    expect(bucketOutcomes([]).map(b => b.range)).toEqual([
      '0.5–0.6', '0.6–0.7', '0.7–0.8', '0.8–0.9', '0.9–1.0',
    ])
  })

  it('flags every band insufficient when there is no data', () => {
    expect(bucketOutcomes([]).every(b => b.insufficient)).toBe(true)
  })

  it('computes the realised win rate and average PnL per band', () => {
    // 4 trades all at confidence 0.85: 1 win, 3 losses → 25% realised win rate.
    const band = bucketOutcomes([
      { confidence: 0.85, pnl: 10 },
      { confidence: 0.85, pnl: -5 },
      { confidence: 0.85, pnl: -3 },
      { confidence: 0.85, pnl: -2 },
    ]).find(b => b.range === '0.8–0.9')!
    expect(band.n).toBe(4)
    expect(band.realisedWinRate).toBe(0.25)
    expect(band.avgPnl).toBeCloseTo(0, 5) // (10−5−3−2)/4
    expect(band.insufficient).toBe(false)
  })

  it('keeps a band insufficient below the minimum sample size', () => {
    const band = bucketOutcomes([
      { confidence: 0.75, pnl: 5 },
      { confidence: 0.75, pnl: 5 },
    ]).find(b => b.range === '0.7–0.8')!
    expect(band.n).toBe(2)
    expect(band.insufficient).toBe(true)
  })

  it('places a confidence of exactly 1.0 in the top band', () => {
    expect(bucketOutcomes([{ confidence: 1.0, pnl: 5 }]).find(b => b.range === '0.9–1.0')!.n).toBe(1)
  })
})

describe('CalibrationService', () => {
  it('buckets the outcomes returned by the decision repository', async () => {
    const decisions = {
      findConfidenceOutcomes: vi.fn(async () => [
        { confidence: 0.65, pnl: 10 },
        { confidence: 0.65, pnl: 20 },
        { confidence: 0.65, pnl: -5 },
      ]),
    } as unknown as DecisionRepository
    const buckets = await new CalibrationService(decisions).compute()
    const band = buckets.find(b => b.range === '0.6–0.7')!
    expect(band.n).toBe(3)
    expect(band.realisedWinRate).toBeCloseTo(2 / 3, 5)
  })
})
