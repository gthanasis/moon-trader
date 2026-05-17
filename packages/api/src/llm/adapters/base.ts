import type { TradingContext, LLMDecision } from '../../common'

export interface LLMAdapter {
  /**
   * Returns one trading decision per coin the model has a view on. A single
   * `LLMDecision` is also accepted (treated as a one-element batch) for
   * backward compatibility with older adapters and test doubles.
   */
  decide(context: TradingContext): Promise<LLMDecision[] | LLMDecision>
}
