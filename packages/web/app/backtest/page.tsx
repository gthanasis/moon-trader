import { backtestRunRepository } from '@trader/db'
import { getCandleDateRange } from './actions'
import { BacktestUnified } from './backtest-unified'

export default async function BacktestPage() {
  const [runs, range] = await Promise.all([
    backtestRunRepository.findAll(50),
    getCandleDateRange(),
  ])
  return <BacktestUnified initialRuns={runs} defaultFrom={range?.from} defaultTo={range?.to} />
}
