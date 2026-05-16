import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import type { Narration, NarrationGranularity } from '../common'
import { NarrationRepository } from '../prisma/repositories/narration.repository'
import { pickGranularity } from '../narration/narration-periods'

const GRANULARITIES: NarrationGranularity[] = ['6h', 'day', 'week', 'month']
const DEFAULT_SPAN_MS = 90 * 24 * 60 * 60 * 1000

@Controller('narrations')
export class NarrationController {
  constructor(private readonly narrations: NarrationRepository) {}

  /**
   * Narrations within [from, to). `granularity` is optional — when omitted it
   * is chosen from the span so the dashboard can just pass the visible range.
   */
  @Get()
  list(
    @Query('granularity') granularity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<Narration[]> {
    const toDate = to ? new Date(to) : new Date()
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - DEFAULT_SPAN_MS)
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid from/to date')
    }

    const g = (granularity as NarrationGranularity) ?? pickGranularity(toDate.getTime() - fromDate.getTime())
    if (!GRANULARITIES.includes(g)) {
      throw new BadRequestException(`granularity must be one of: ${GRANULARITIES.join(', ')}`)
    }

    return this.narrations.find(g, fromDate, toDate)
  }
}
