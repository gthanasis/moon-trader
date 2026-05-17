import { Injectable } from '@nestjs/common'
import type { LLMDecision, FeatureSet } from '../../common'
import { PrismaService } from '../prisma.service'

export type DecisionStatus = 'executed' | 'blocked' | 'pending' | 'approved' | 'rejected'

export interface StoredDecision extends LLMDecision {
  id: string
  status: DecisionStatus
  /** When status='blocked', the reason the engine or risk gate rejected the decision. */
  blockedReason: string | null
  expiresAt: Date | null
  decidedAt: Date
}

type DecisionRow = {
  id: string
  action: string
  coin: string
  size: number
  confidence: number
  reasoning: string
  stopLoss: number | null
  takeProfit: number | null
  status: string
  blockedReason: string | null
  expiresAt: Date | null
  decidedAt: Date
}

function toStoredDecision(row: DecisionRow): StoredDecision {
  return {
    id: row.id,
    action: row.action as LLMDecision['action'],
    coin: row.coin,
    size: row.size,
    confidence: row.confidence,
    reasoning: row.reasoning,
    stopLoss: row.stopLoss ?? undefined,
    takeProfit: row.takeProfit ?? undefined,
    status: row.status as DecisionStatus,
    blockedReason: row.blockedReason,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
  }
}

@Injectable()
export class DecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveDecision(
    decision: LLMDecision,
    status: DecisionStatus = 'executed',
    blockedReason: string | null = null,
    features: FeatureSet | null = null,
  ): Promise<string> {
    const row = await this.prisma.llmDecision.create({
      data: {
        action: decision.action, coin: decision.coin, size: decision.size,
        confidence: decision.confidence, reasoning: decision.reasoning,
        stopLoss: decision.stopLoss ?? null, takeProfit: decision.takeProfit ?? null,
        status,
        blockedReason,
        // Cast mirrors NarrationRepository — Prisma's Json input lacks an index signature.
        features: features ? (features as object) : undefined,
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
    return row ? toStoredDecision(row) : null
  }

  async findRecentDecisions(limit = 20): Promise<StoredDecision[]> {
    const rows = await this.prisma.llmDecision.findMany({
      orderBy: { decidedAt: 'desc' },
      take: limit,
    })
    return rows.map(toStoredDecision)
  }

  /** Decisions whose `decidedAt` falls in [from, to) — used for period narration. */
  async findBetween(from: Date, to: Date): Promise<StoredDecision[]> {
    const rows = await this.prisma.llmDecision.findMany({
      where: { decidedAt: { gte: from, lt: to } },
      orderBy: { decidedAt: 'asc' },
    })
    return rows.map(toStoredDecision)
  }

  async updateDecisionStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    await this.prisma.llmDecision.update({
      where: { id },
      data: { status },
    })
  }
}
