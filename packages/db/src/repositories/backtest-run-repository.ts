import type { PrismaClient } from '@prisma/client'
import type { BacktestStats, BacktestTrade, PnlPoint, BacktestResult } from '@trader/shared'

export type { BacktestStats, BacktestTrade, PnlPoint, BacktestResult }

export interface BacktestRunConfig {
  from: Date
  to: Date
  coins: string[]
  model: string
  intervalMs: number
  initialCapital: number
}

export interface StepDecision {
  timestamp: string
  action: string
  coin: string
  /** Size proposed by the LLM (before risk-based sizing). */
  size: number
  confidence: number
  reasoning: string
  /** Whether the decision actually reached the engine and filled. False for hold/blocked. */
  executed?: boolean
  /** When `executed` is false and action !== 'hold', the reason it was blocked. */
  blockedReason?: string
  /** Size after risk-based sizing — what was actually sent to the engine. May differ from `size`. */
  executedSize?: number
}

export interface BacktestRunSummary {
  id: string
  createdAt: Date
  from: Date
  to: Date
  coins: string[]
  model: string
  intervalMs: number
  initialCapital: number
  status: string
  stats: BacktestStats | null
  errorMessage: string | null
}

export interface BacktestRunDetail extends BacktestRunSummary {
  trades: BacktestTrade[]
  pnlCurve: PnlPoint[]
  decisions: StepDecision[]
}

export class BacktestRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(config: BacktestRunConfig): Promise<string> {
    const run = await this.prisma.backtestRun.create({
      data: { ...config, status: 'running' },
    })
    return run.id
  }

  async complete(id: string, result: BacktestResult, decisions: StepDecision[]): Promise<void> {
    await this.prisma.backtestRun.update({
      where: { id },
      data: {
        status: 'done',
        stats: result.stats as any,
        trades: result.trades as any,
        pnlCurve: result.pnlCurve as any,
        decisions: decisions as any,
      },
    })
  }

  async saveDecisions(id: string, decisions: StepDecision[]): Promise<void> {
    await this.prisma.backtestRun.update({
      where: { id },
      data: { decisions: decisions as any },
    })
  }

  async fail(id: string, message: string, decisions?: StepDecision[]): Promise<void> {
    await this.prisma.backtestRun.update({
      where: { id },
      data: {
        status: 'error',
        errorMessage: message,
        ...(decisions?.length ? { decisions: decisions as any } : {}),
      },
    })
  }

  async cancel(id: string, result: BacktestResult, decisions: StepDecision[]): Promise<void> {
    await this.prisma.backtestRun.update({
      where: { id },
      data: {
        status: 'cancelled',
        errorMessage: 'Cancelled',
        stats: result.stats as any,
        trades: result.trades as any,
        pnlCurve: result.pnlCurve as any,
        decisions: decisions as any,
      },
    })
  }

  async findAll(limit = 50): Promise<BacktestRunSummary[]> {
    const rows = await this.prisma.backtestRun.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        from: true,
        to: true,
        coins: true,
        model: true,
        intervalMs: true,
        initialCapital: true,
        status: true,
        stats: true,
        errorMessage: true,
      },
    })
    return rows.map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      from: r.from,
      to: r.to,
      coins: r.coins as string[],
      model: r.model,
      intervalMs: r.intervalMs,
      initialCapital: r.initialCapital,
      status: r.status,
      stats: r.stats as unknown as BacktestStats | null,
      errorMessage: r.errorMessage,
    }))
  }

  async findById(id: string): Promise<BacktestRunDetail | null> {
    const r = await this.prisma.backtestRun.findUnique({ where: { id } })
    if (!r) return null
    return {
      id: r.id,
      createdAt: r.createdAt,
      from: r.from,
      to: r.to,
      coins: r.coins as string[],
      model: r.model,
      intervalMs: r.intervalMs,
      initialCapital: r.initialCapital,
      status: r.status,
      stats: r.stats as unknown as BacktestStats | null,
      errorMessage: r.errorMessage,
      trades: (r.trades as unknown as BacktestTrade[]) ?? [],
      pnlCurve: (r.pnlCurve as unknown as PnlPoint[]) ?? [],
      decisions: (r.decisions as unknown as StepDecision[]) ?? [],
    }
  }
}
