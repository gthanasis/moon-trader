import { BadRequestException, Body, Controller, Param, Patch } from '@nestjs/common'
import { DecisionRepository } from '../prisma/repositories/decision.repository'

@Controller('decisions')
export class DecisionsController {
  constructor(private readonly decisions: DecisionRepository) {}

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
