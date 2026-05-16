'use client'

import { BacktestUnified } from './backtest-unified'
import { useBacktestRuns, useCandleRange } from '@/lib/queries'

export default function BacktestPage() {
  const { data: runs = [] } = useBacktestRuns()
  const { data: range } = useCandleRange()
  return (
    <BacktestUnified
      initialRuns={runs}
      defaultFrom={range?.from}
      defaultTo={range?.to}
    />
  )
}
