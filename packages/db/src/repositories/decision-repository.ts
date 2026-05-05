import type { LLMDecision } from '@trader/shared'
import type { PrismaClient } from '@prisma/client'

export class DecisionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveDecision(decision: LLMDecision): Promise<string> {
    const row = await this.prisma.llmDecision.create({
      data: {
        action: decision.action, coin: decision.coin, size: decision.size,
        confidence: decision.confidence, reasoning: decision.reasoning,
        stopLoss: decision.stopLoss ?? null, takeProfit: decision.takeProfit ?? null,
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
}
