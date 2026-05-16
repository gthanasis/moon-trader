import { BadRequestException, Body, Controller, Get, Param, Patch, Query } from '@nestjs/common'
import {
  DecisionRepository,
  type StoredDecision,
} from '../prisma/repositories/decision.repository'

@Controller('decisions')
export class DecisionsController {
  constructor(private readonly decisions: DecisionRepository) {}

  /** Recent decisions (most recent first) — for the home decision log. */
  @Get()
  list(@Query('limit') limit?: string): Promise<StoredDecision[]> {
    const n = Number(limit)
    return this.decisions.findRecentDecisions(Number.isFinite(n) && n > 0 ? n : 20)
  }

  /** The pending decision awaiting approval, or null. */
  @Get('pending')
  pending(): Promise<StoredDecision | null> {
    return this.decisions.findPendingDecision()
  }

  /** Approve/reject a pending decision — replaces web's PATCH /api/decisions/[id]. */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { status?: string },
  ): Promise<{ ok: true }> {
    if (body.status !== 'approved' && body.status !== 'rejected') {
      throw new BadRequestException('status must be approved or rejected')
    }
    await this.decisions.updateDecisionStatus(id, body.status)
    return { ok: true }
  }
}
