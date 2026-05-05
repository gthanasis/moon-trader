import type { LLMDecision } from '@trader/shared'
import type { PrismaClient } from '@prisma/client'

export interface StoredDecision extends LLMDecision {
  id: string
  status: string
  expiresAt: Date | null
  decidedAt: Date
}

export class DecisionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveDecision(decision: LLMDecision): Promise<string> {
    const row = await this.prisma.llmDecision.create({
      data: {
        action: decision.action, coin: decision.coin, size: decision.size,
        confidence: decision.confidence, reasoning: decision.reasoning,
        stopLoss: decision.stopLoss ?? null, takeProfit: decision.takeProfit ?? null,
        status: 'executed',
      },
    })
    return row.id
  }

  async linkDecisionToTrade(decisionId: string, tradeId: string): Promise<void> {
    await this.prisma.llmDecision.update({
      where: { id: decisionId },
      data: { tradeId },
    })
  }

  async findPendingDecision(): Promise<StoredDecision | null> {
    const row = await this.prisma.llmDecision.findFirst({
      where: { status: 'pending' },
      orderBy: { decidedAt: 'desc' },
    })
    if (!row) return null
    return {
      id: row.id,
      action: row.action as LLMDecision['action'],
      coin: row.coin,
      size: row.size,
      confidence: row.confidence,
      reasoning: row.reasoning,
      stopLoss: row.stopLoss ?? undefined,
      takeProfit: row.takeProfit ?? undefined,
      status: row.status,
      expiresAt: row.expiresAt,
      decidedAt: row.decidedAt,
    }
  }

  async updateDecisionStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    await this.prisma.llmDecision.update({
      where: { id },
      data: { status },
    })
  }
}
