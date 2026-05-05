export type {
  BacktestConfig,
  BacktestTrade,
  BacktestStats,
  PnlPoint,
  BacktestResult,
} from './types.js'
export { historicalSlice } from './historical-slice.js'
export { getFillPrice } from './fill-simulator.js'
export { calculateStats } from './stats-calculator.js'
export { BacktestRunner } from './backtest-runner.js'
