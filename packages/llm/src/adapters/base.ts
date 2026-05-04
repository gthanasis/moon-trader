import type { TradingContext, LLMDecision } from '@trader/shared'

export interface LLMAdapter {
  decide(context: TradingContext): Promise<LLMDecision>
}
