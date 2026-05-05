export { getPrismaClient } from './client.js'
export type { PrismaClient } from './client.js'
export { TradeRepository } from './repositories/trade-repository.js'
export { SignalRepository } from './repositories/signal-repository.js'
export { DecisionRepository } from './repositories/decision-repository.js'
export type { StoredDecision } from './repositories/decision-repository.js'
export { CandleRepository } from './repositories/candle-repository.js'
export { BotStateRepository } from './repositories/bot-state-repository.js'

import { getPrismaClient } from './client.js'
import { TradeRepository } from './repositories/trade-repository.js'
import { SignalRepository } from './repositories/signal-repository.js'
import { DecisionRepository } from './repositories/decision-repository.js'
import { CandleRepository } from './repositories/candle-repository.js'
import { BotStateRepository } from './repositories/bot-state-repository.js'

export const tradeRepository = new TradeRepository(getPrismaClient())
export const signalRepository = new SignalRepository(getPrismaClient())
export const decisionRepository = new DecisionRepository(getPrismaClient())
export const candleRepository = new CandleRepository(getPrismaClient())
export const botStateRepository = new BotStateRepository(getPrismaClient())
