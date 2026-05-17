import { describe, it, expect, vi } from 'vitest'
import { runCycleWithPersistence } from '../../src/trading/cycle-runner'

describe('runCycleWithPersistence — pause gating', () => {
  it('skips cycle.run() and returns null when the bot is paused', async () => {
    const cycle = { run: vi.fn() }

    const result = await runCycleWithPersistence(
      cycle as never, {} as never, {} as never, {} as never,
      async () => true,
    )

    expect(cycle.run).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('runs the cycle and persists the decision when not paused', async () => {
    const decision = { action: 'hold', coin: 'BTC/USDT', confidence: 0.5, reasoning: 'x' }
    const cycle = { run: vi.fn(async () => [{ executed: false, decision, reason: undefined }]) }
    const decisionRepo = { saveDecision: vi.fn(async () => 'd1'), linkDecisionToTrade: vi.fn() }

    const result = await runCycleWithPersistence(
      cycle as never, {} as never, decisionRepo as never, {} as never,
      async () => false,
    )

    expect(cycle.run).toHaveBeenCalledOnce()
    expect(decisionRepo.saveDecision).toHaveBeenCalledWith(decision, 'blocked', null, null, null)
    expect(result).not.toBeNull()
  })

  it('does not persist a new trade row when the buy scaled into an existing position', async () => {
    const decision = { action: 'buy', coin: 'BTC/USDT', confidence: 0.9, reasoning: 'add' }
    const cycle = {
      run: vi.fn(async () => [
        { executed: true, scaledIn: true, decision, executedDecision: decision, reason: undefined },
      ]),
    }
    const decisionRepo = { saveDecision: vi.fn(async () => 'd1'), linkDecisionToTrade: vi.fn() }
    const tradeRepo = { saveTrade: vi.fn() }
    const engine = { getPositions: vi.fn(() => []), isPaper: () => true }

    await runCycleWithPersistence(
      cycle as never, engine as never, decisionRepo as never, tradeRepo as never,
      async () => false,
    )

    expect(decisionRepo.saveDecision).toHaveBeenCalledWith(decision, 'executed', null, null, null)
    expect(tradeRepo.saveTrade).not.toHaveBeenCalled()
    expect(decisionRepo.linkDecisionToTrade).not.toHaveBeenCalled()
  })
})
