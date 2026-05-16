import type { TradingContext, LLMDecision } from '../../common'

export interface LLMAdapter {
  decide(context: TradingContext): Promise<LLMDecision>
}
