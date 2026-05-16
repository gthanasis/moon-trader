import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Sse,
  type MessageEvent,
} from '@nestjs/common'
import { Observable, of } from 'rxjs'
import { BacktestRunRepository } from '../prisma/repositories/backtest-run.repository'
import { BacktestService } from '../backtest/backtest.service'

/** Coerces a mixed query/body record to the string record parseParams expects. */
function toStringRecord(input: Record<string, unknown>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = v === undefined || v === null ? undefined : String(v)
  }
  return out
}

@Controller('backtest')
export class BacktestController {
  constructor(
    private readonly runs: BacktestRunRepository,
    private readonly backtest: BacktestService,
  ) {}

  /** Persisted backtest runs — replaces web's GET /api/backtest/runs. */
  @Get('runs')
  listRuns() {
    return this.runs.findAll(50)
  }

  /** Available candle date range — replaces web's getCandleDateRange action. */
  @Get('candle-range')
  candleRange() {
    return this.backtest.getCandleDateRange()
  }

  /** A single persisted run — replaces web's GET /api/backtest/runs/[id]. */
  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    const run = await this.runs.findById(id)
    if (!run) throw new NotFoundException('Not found')
    return run
  }

  /** Runs a backtest to completion (no streaming) — replaces the runBacktest action. */
  @Post('runs')
  async run(@Body() body: Record<string, unknown>) {
    const parsed = this.backtest.parseParams(toStringRecord(body))
    if (!parsed.ok) throw new BadRequestException(parsed.error)
    return this.backtest.run(parsed.params)
  }

  /** Live backtest progress over SSE — replaces web's GET /api/backtest/stream. */
  @Sse('stream')
  stream(@Query() query: Record<string, string>): Observable<MessageEvent> {
    const parsed = this.backtest.parseParams(toStringRecord(query))
    if (!parsed.ok) {
      return of<MessageEvent>({ data: { type: 'error', message: parsed.error } })
    }
    return this.backtest.stream(parsed.params)
  }
}
