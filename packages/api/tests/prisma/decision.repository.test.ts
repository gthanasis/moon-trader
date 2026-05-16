import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LLMDecision } from '../../src/common'
import { DecisionRepository } from '../../src/prisma/repositories/decision.repository'
import type { PrismaClient } from '@prisma/client'

function makeMockPrisma() {
  return {
    llmDecision: { create: vi.fn(), update: vi.fn() },
  } as unknown as PrismaClient
}

const domainDecision: LLMDecision = {
  action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.85,
  reasoning: 'Strong momentum', stopLoss: 48000, takeProfit: 55000,
}

describe('DecisionRepository', () => {
  let prisma: PrismaClient
  let repo: DecisionRepository

  beforeEach(() => { prisma = makeMockPrisma(); repo = new DecisionRepository(prisma) })

  it('saveDecision calls prisma.llmDecision.create with mapped fields', async () => {
    const mockCreate = prisma.llmDecision.create as ReturnType<typeof vi.fn>
    mockCreate.mockResolvedValue({ id: 'decision-1', ...domainDecision })
    await repo.saveDecision(domainDecision)
    expect(mockCreate).toHaveBeenCalledOnce()
    const { data } = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(data['action']).toBe('buy')
    expect(data['size']).toBe(200)
    expect(data['stopLoss']).toBe(48000)
  })

  it('saveDecision returns the generated id', async () => {
    const mockCreate = prisma.llmDecision.create as ReturnType<typeof vi.fn>
    mockCreate.mockResolvedValue({ id: 'decision-abc' })
    const id = await repo.saveDecision(domainDecision)
    expect(id).toBe('decision-abc')
  })

  it('linkDecisionToTrade calls prisma.llmDecision.update with tradeId', async () => {
    const mockUpdate = prisma.llmDecision.update as ReturnType<typeof vi.fn>
    mockUpdate.mockResolvedValue({})
    await repo.linkDecisionToTrade('decision-1', 'trade-1')
    const args = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect((args['where'] as Record<string, string>)['id']).toBe('decision-1')
    expect((args['data'] as Record<string, string>)['tradeId']).toBe('trade-1')
  })
})
