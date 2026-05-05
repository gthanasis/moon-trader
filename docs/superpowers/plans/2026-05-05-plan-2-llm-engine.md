# Crypto Trader — Plan 2: LLM Decision Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the model-agnostic `@trader/llm` package with Claude and OpenAI adapters, prompt construction from TradingContext, and an EvaluationCycle that wires Pipeline → LLM → TradingEngine into a single runnable cycle.

**Architecture:** `@trader/llm` exposes a single `LLMAdapter` interface implemented by `ClaudeAdapter` (using `@anthropic-ai/sdk` with prompt caching) and `OpenAIAdapter` (using `openai`). A shared `buildPrompt()` function turns `TradingContext` into a structured system + user message pair used by both adapters. `EvaluationCycle` orchestrates one full cycle: fetch signals, build context, call adapter, check approval threshold, execute via TradingEngine.

**Tech Stack:** `@anthropic-ai/sdk ^0.30`, `openai ^4`, vitest for mocking SDKs with `vi.hoisted()`

---

## File Map

```
packages/llm/
  package.json
  tsconfig.json
  src/
    adapters/
      base.ts               # LLMAdapter interface (one method: decide)
      claude.ts             # ClaudeAdapter — Anthropic SDK, prompt caching
      openai.ts             # OpenAIAdapter — OpenAI SDK, function calling
    prompt-builder.ts       # buildPrompt(context) → { system, user }
    evaluation-cycle.ts     # EvaluationCycle — one full pipeline→llm→engine pass
    index.ts                # re-exports all public API
  tests/
    prompt-builder.test.ts
    adapters/
      claude.test.ts
      openai.test.ts
    evaluation-cycle.test.ts
```

---

## Task 1: Package setup + LLMAdapter interface

**Files:**
- Create: `packages/llm/package.json`
- Create: `packages/llm/tsconfig.json`
- Create: `packages/llm/src/adapters/base.ts`

- [ ] **Step 1: Create `packages/llm/package.json`**

```json
{
  "name": "@trader/llm",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.0.0",
    "@trader/shared": "workspace:*",
    "@trader/core": "workspace:*",
    "@trader/data": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/llm/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/llm/src/adapters/base.ts`**

```typescript
import type { TradingContext, LLMDecision } from '@trader/shared'

export interface LLMAdapter {
  decide(context: TradingContext): Promise<LLMDecision>
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd /Users/thanasisgliatis/git/trader && pnpm install
```

Expected: `@anthropic-ai/sdk` and `openai` appear in `packages/llm/node_modules` (or hoisted), no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/package.json packages/llm/tsconfig.json packages/llm/src/adapters/base.ts
git commit -m "feat(llm): init @trader/llm package with LLMAdapter interface"
```

---

## Task 2: PromptBuilder

**Files:**
- Create: `packages/llm/src/prompt-builder.ts`
- Create: `packages/llm/tests/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/llm/tests/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/prompt-builder.js'
import type { TradingContext } from '@trader/shared'

const emptyContext: TradingContext = {
  snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
  positions: [],
  availableCapital: 1000,
  recentTrades: [],
  openOrders: [],
}

describe('buildPrompt', () => {
  it('includes available capital in user message', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('1000.00')
  })

  it('shows no open positions message when positions are empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No open positions')
  })

  it('includes position details when positions exist', () => {
    const context: TradingContext = {
      ...emptyContext,
      positions: [{
        coin: 'BTC/USDT',
        size: 200,
        entryPrice: 50000,
        currentPrice: 55000,
        openedAt: new Date(),
      }],
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('BTC/USDT')
    expect(user).toContain('50000')
    expect(user).toContain('55000')
  })

  it('includes signal content in user message', () => {
    const context: TradingContext = {
      ...emptyContext,
      snapshot: {
        timestamp: new Date(),
        signals: [{
          source: 'test',
          type: 'sentiment',
          content: 'Fear index: 25',
          timestamp: new Date(),
        }],
        ohlcv: {},
      },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('Fear index: 25')
  })

  it('limits signals to 20 most recent', () => {
    const signals = Array.from({ length: 25 }, (_, i) => ({
      source: 'test',
      type: 'news' as const,
      content: `Signal ${i}`,
      timestamp: new Date(Date.now() - i * 1000),
    }))
    const context: TradingContext = {
      ...emptyContext,
      snapshot: { timestamp: new Date(), signals, ohlcv: {} },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('Signal 0')
    expect(user).not.toContain('Signal 24')
  })

  it('system prompt instructs use of make_trading_decision tool', () => {
    const { system } = buildPrompt(emptyContext)
    expect(system).toContain('make_trading_decision')
  })

  it('system prompt mentions hold as default when uncertain', () => {
    const { system } = buildPrompt(emptyContext)
    expect(system).toContain('hold')
  })

  it('shows no recent trades message when trades are empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No recent trades')
  })

  it('includes recent trade details when trades exist', () => {
    const context: TradingContext = {
      ...emptyContext,
      recentTrades: [{
        id: '1',
        coin: 'ETH/USDT',
        side: 'buy',
        size: 100,
        entryPrice: 3000,
        openedAt: new Date(),
        pnl: 5.2,
      }],
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('ETH/USDT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/llm && pnpm install && pnpm test tests/prompt-builder.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/llm/src/prompt-builder.ts`**

```typescript
import type { TradingContext } from '@trader/shared'

export function buildPrompt(context: TradingContext): { system: string; user: string } {
  const system = `You are a professional crypto trading assistant. Analyze market conditions and make precise, disciplined trading decisions.

## Strategy Guidelines
- Only trade top-tier cryptocurrencies (BTC/USDT, ETH/USDT, BNB/USDT, SOL/USDT, XRP/USDT, ADA/USDT, DOGE/USDT, AVAX/USDT, DOT/USDT, MATIC/USDT)
- Only buy when confidence > 0.7
- Never risk more than 20% of available capital on a single trade
- Always include a stop-loss level for buy orders
- Consider macro conditions — avoid buying during extreme fear unless signal is very strong
- When uncertain, choose hold

## Decision Tool
Use the make_trading_decision tool to submit exactly one decision per analysis cycle.`

  const positionLines = context.positions.length === 0
    ? 'No open positions'
    : context.positions
        .map(p => {
          const pct = ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
          return `- ${p.coin}: $${p.size.toFixed(2)} at $${p.entryPrice} (current: $${p.currentPrice}, ${pct.toFixed(1)}%)`
        })
        .join('\n')

  const signalLines = context.snapshot.signals.length === 0
    ? 'No signals available'
    : context.snapshot.signals
        .slice(0, 20)
        .map(s => {
          const coins = s.coins ? ` [${s.coins.join(', ')}]` : ''
          return `[${s.timestamp.toISOString()}] [${s.type.toUpperCase()}]${coins} ${s.content}`
        })
        .join('\n')

  const tradeLines = context.recentTrades.length === 0
    ? 'No recent trades'
    : context.recentTrades
        .slice(0, 5)
        .map(t => {
          const pnl = t.pnl !== undefined ? ` P&L: ${t.pnl.toFixed(1)}%` : ''
          return `- ${t.side.toUpperCase()} ${t.coin}: $${t.size}${pnl}`
        })
        .join('\n')

  const user = `## Current State
Available capital: $${context.availableCapital.toFixed(2)}

## Open Positions
${positionLines}

## Recent Signals (most recent first)
${signalLines}

## Recent Trades
${tradeLines}

Analyze the above and submit your trading decision.`

  return { system, user }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/llm && pnpm test tests/prompt-builder.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/prompt-builder.ts packages/llm/tests/prompt-builder.test.ts
git commit -m "feat(llm): add buildPrompt producing cacheable system + dynamic user message"
```

---

## Task 3: ClaudeAdapter

**Files:**
- Create: `packages/llm/src/adapters/claude.ts`
- Create: `packages/llm/tests/adapters/claude.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/llm/tests/adapters/claude.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { TradingContext } from '@trader/shared'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

const { ClaudeAdapter } = await import('../../src/adapters/claude.js')

const emptyContext: TradingContext = {
  snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
  positions: [],
  availableCapital: 1000,
  recentTrades: [],
  openOrders: [],
}

const toolUseResponse = (input: object) => ({
  content: [{ type: 'tool_use', id: 'tu_1', name: 'make_trading_decision', input }],
})

describe('ClaudeAdapter', () => {
  beforeEach(() => mockCreate.mockReset())

  it('returns LLMDecision from tool use response', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({
      action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.85, reasoning: 'strong signal',
    }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    const decision = await adapter.decide(emptyContext)
    expect(decision.action).toBe('buy')
    expect(decision.coin).toBe('BTC/USDT')
    expect(decision.confidence).toBe(0.85)
  })

  it('falls back to hold when no tool_use block in response', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot decide' }] })
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    const decision = await adapter.decide(emptyContext)
    expect(decision.action).toBe('hold')
    expect(decision.reasoning).toMatch(/no tool use/i)
  })

  it('uses claude-sonnet-4-6 by default', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-4-6' }))
  })

  it('uses custom model when specified', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test', model: 'claude-haiku-4-5-20251001' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }))
  })

  it('adds cache_control to system prompt block', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    const call = mockCreate.mock.calls[0][0]
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('forces tool use with tool_choice any', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    const call = mockCreate.mock.calls[0][0]
    expect(call.tool_choice).toEqual({ type: 'any' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/llm && pnpm test tests/adapters/claude.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/llm/src/adapters/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { TradingContext, LLMDecision } from '@trader/shared'
import type { LLMAdapter } from './base.js'
import { buildPrompt } from '../prompt-builder.js'

const TOOL_DEFINITION: Anthropic.Tool = {
  name: 'make_trading_decision',
  description: 'Submit a trading decision based on the market analysis',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['buy', 'sell', 'hold'] },
      coin: { type: 'string', description: 'Coin pair e.g. BTC/USDT' },
      size: { type: 'number', description: 'Trade size in USDT' },
      confidence: { type: 'number', description: 'Confidence score 0-1' },
      reasoning: { type: 'string', description: 'Reasoning for the decision' },
      stopLoss: { type: 'number', description: 'Stop loss price (optional)' },
      takeProfit: { type: 'number', description: 'Take profit price (optional)' },
    },
    required: ['action', 'coin', 'size', 'confidence', 'reasoning'],
  },
}

interface ClaudeAdapterConfig {
  apiKey: string
  model?: string
}

export class ClaudeAdapter implements LLMAdapter {
  private readonly client: Anthropic
  private readonly model: string

  constructor(config: ClaudeAdapterConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.model = config.model ?? 'claude-sonnet-4-6'
  }

  async decide(context: TradingContext): Promise<LLMDecision> {
    const { system, user } = buildPrompt(context)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'any' },
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'No tool use in response' }
    }

    return toolUse.input as LLMDecision
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/llm && pnpm test tests/adapters/claude.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/adapters/claude.ts packages/llm/tests/adapters/claude.test.ts
git commit -m "feat(llm): add ClaudeAdapter with prompt caching and tool use"
```

---

## Task 4: OpenAIAdapter

**Files:**
- Create: `packages/llm/src/adapters/openai.ts`
- Create: `packages/llm/tests/adapters/openai.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/llm/tests/adapters/openai.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { TradingContext } from '@trader/shared'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}))

const { OpenAIAdapter } = await import('../../src/adapters/openai.js')

const emptyContext: TradingContext = {
  snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
  positions: [],
  availableCapital: 1000,
  recentTrades: [],
  openOrders: [],
}

const toolCallResponse = (args: object) => ({
  choices: [{
    message: {
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'make_trading_decision', arguments: JSON.stringify(args) },
      }],
    },
  }],
})

describe('OpenAIAdapter', () => {
  beforeEach(() => mockCreate.mockReset())

  it('returns LLMDecision from tool call response', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({
      action: 'sell', coin: 'ETH/USDT', size: 150, confidence: 0.75, reasoning: 'profit taking',
    }))
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    const decision = await adapter.decide(emptyContext)
    expect(decision.action).toBe('sell')
    expect(decision.coin).toBe('ETH/USDT')
    expect(decision.confidence).toBe(0.75)
  })

  it('falls back to hold when no tool call in response', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { tool_calls: undefined } }] })
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    const decision = await adapter.decide(emptyContext)
    expect(decision.action).toBe('hold')
    expect(decision.reasoning).toMatch(/no tool call/i)
  })

  it('uses gpt-4o by default', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }))
  })

  it('uses custom model when specified', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new OpenAIAdapter({ apiKey: 'test', model: 'gpt-4o-mini' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-mini' }))
  })

  it('forces tool use by specifying function name in tool_choice', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    const call = mockCreate.mock.calls[0][0]
    expect(call.tool_choice).toEqual({ type: 'function', function: { name: 'make_trading_decision' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/llm && pnpm test tests/adapters/openai.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/llm/src/adapters/openai.ts`**

```typescript
import OpenAI from 'openai'
import type { TradingContext, LLMDecision } from '@trader/shared'
import type { LLMAdapter } from './base.js'
import { buildPrompt } from '../prompt-builder.js'

const TOOL_DEFINITION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'make_trading_decision',
    description: 'Submit a trading decision based on the market analysis',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['buy', 'sell', 'hold'] },
        coin: { type: 'string', description: 'Coin pair e.g. BTC/USDT' },
        size: { type: 'number', description: 'Trade size in USDT' },
        confidence: { type: 'number', description: 'Confidence score 0-1' },
        reasoning: { type: 'string', description: 'Reasoning for the decision' },
        stopLoss: { type: 'number', description: 'Stop loss price (optional)' },
        takeProfit: { type: 'number', description: 'Take profit price (optional)' },
      },
      required: ['action', 'coin', 'size', 'confidence', 'reasoning'],
    },
  },
}

interface OpenAIAdapterConfig {
  apiKey: string
  model?: string
}

export class OpenAIAdapter implements LLMAdapter {
  private readonly client: OpenAI
  private readonly model: string

  constructor(config: OpenAIAdapterConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey })
    this.model = config.model ?? 'gpt-4o'
  }

  async decide(context: TradingContext): Promise<LLMDecision> {
    const { system, user } = buildPrompt(context)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'function', function: { name: 'make_trading_decision' } },
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall) {
      return { action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'No tool call in response' }
    }

    return JSON.parse(toolCall.function.arguments) as LLMDecision
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/llm && pnpm test tests/adapters/openai.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/adapters/openai.ts packages/llm/tests/adapters/openai.test.ts
git commit -m "feat(llm): add OpenAIAdapter with function calling"
```

---

## Task 5: EvaluationCycle

**Files:**
- Create: `packages/llm/src/evaluation-cycle.ts`
- Create: `packages/llm/tests/evaluation-cycle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/llm/tests/evaluation-cycle.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EvaluationCycle } from '../src/evaluation-cycle.js'
import type { LLMAdapter } from '../src/adapters/base.js'
import type { LLMDecision } from '@trader/shared'

const mockFetch = vi.fn()
const mockDecide = vi.fn()
const mockExecute = vi.fn()

const mockPipeline = {
  fetch: mockFetch,
  fetchHistorical: vi.fn(),
}

const mockAdapter: LLMAdapter = { decide: mockDecide }

const mockEngine = {
  execute: mockExecute,
  getPositions: vi.fn().mockReturnValue([]),
  getOpenOrders: vi.fn().mockReturnValue([]),
  availableCapital: vi.fn().mockReturnValue(1000),
}

const emptySnapshot = { timestamp: new Date(), signals: [], ohlcv: {} }

const holdDecision: LLMDecision = { action: 'hold', coin: '', size: 0, confidence: 0.5, reasoning: 'uncertain' }
const buySmall: LLMDecision = { action: 'buy', coin: 'BTC/USDT', size: 30, confidence: 0.9, reasoning: 'strong' }
const buyLarge: LLMDecision = { action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'strong' }

describe('EvaluationCycle', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(emptySnapshot)
    mockDecide.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue({ executed: true })
  })

  it('returns hold result without executing when LLM decides to hold', async () => {
    mockDecide.mockResolvedValue(holdDecision)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toBe('hold')
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('auto-executes buy below autoTradeLimit without approval', async () => {
    mockDecide.mockResolvedValue(buySmall)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    const result = await cycle.run()
    expect(result.executed).toBe(true)
    expect(mockExecute).toHaveBeenCalledWith(buySmall)
  })

  it('requests approval for buy above autoTradeLimit', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const onApprovalNeeded = vi.fn().mockResolvedValue(true)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50, onApprovalNeeded })
    const result = await cycle.run()
    expect(onApprovalNeeded).toHaveBeenCalledWith(buyLarge)
    expect(result.executed).toBe(true)
  })

  it('does not execute when approval is rejected', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const onApprovalNeeded = vi.fn().mockResolvedValue(false)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50, onApprovalNeeded })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/rejected/i)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('auto-executes large trade when no onApprovalNeeded callback provided', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    const result = await cycle.run()
    expect(result.executed).toBe(true)
    expect(mockExecute).toHaveBeenCalled()
  })

  it('passes full TradingContext to adapter including positions and capital', async () => {
    mockDecide.mockResolvedValue(holdDecision)
    mockEngine.getPositions.mockReturnValue([{ coin: 'ETH/USDT', size: 100, entryPrice: 3000, currentPrice: 3100, openedAt: new Date() }])
    mockEngine.availableCapital.mockReturnValue(900)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    await cycle.run()
    const contextArg = mockDecide.mock.calls[0][0]
    expect(contextArg.availableCapital).toBe(900)
    expect(contextArg.positions).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/llm && pnpm test tests/evaluation-cycle.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/llm/src/evaluation-cycle.ts`**

```typescript
import type { LLMDecision, TradingContext, WorldSnapshot, Position, Order } from '@trader/shared'
import type { LLMAdapter } from './adapters/base.js'

interface PipelineLike {
  fetch(): Promise<WorldSnapshot>
}

interface EngineLike {
  execute(decision: LLMDecision): Promise<{ executed: boolean; reason?: string }>
  getPositions(): Position[]
  getOpenOrders(): Order[]
  availableCapital(): number
}

export interface EvaluationCycleConfig {
  pipeline: PipelineLike
  adapter: LLMAdapter
  engine: EngineLike
  autoTradeLimit: number
  onApprovalNeeded?: (decision: LLMDecision) => Promise<boolean>
}

export interface CycleResult {
  decision: LLMDecision
  executed: boolean
  reason?: string
}

export class EvaluationCycle {
  private readonly config: EvaluationCycleConfig

  constructor(config: EvaluationCycleConfig) {
    this.config = config
  }

  async run(): Promise<CycleResult> {
    const { pipeline, adapter, engine, autoTradeLimit, onApprovalNeeded } = this.config

    const snapshot = await pipeline.fetch()
    const context: TradingContext = {
      snapshot,
      positions: engine.getPositions(),
      availableCapital: engine.availableCapital(),
      recentTrades: [],
      openOrders: engine.getOpenOrders(),
    }

    const decision = await adapter.decide(context)

    if (decision.action === 'hold') {
      return { decision, executed: false, reason: 'hold' }
    }

    if (decision.size > autoTradeLimit && onApprovalNeeded) {
      const approved = await onApprovalNeeded(decision)
      if (!approved) {
        return { decision, executed: false, reason: 'rejected by user' }
      }
    }

    const result = await engine.execute(decision)
    return { decision, executed: result.executed, reason: result.reason }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/llm && pnpm test tests/evaluation-cycle.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/evaluation-cycle.ts packages/llm/tests/evaluation-cycle.test.ts
git commit -m "feat(llm): add EvaluationCycle wiring pipeline→llm→engine with approval threshold"
```

---

## Task 6: Index, build, and integration test

**Files:**
- Create: `packages/llm/src/index.ts`
- Create: `tests/smoke-llm.test.ts`

- [ ] **Step 1: Create `packages/llm/src/index.ts`**

```typescript
export type { LLMAdapter } from './adapters/base.js'
export { ClaudeAdapter } from './adapters/claude.js'
export { OpenAIAdapter } from './adapters/openai.js'
export { buildPrompt } from './prompt-builder.js'
export { EvaluationCycle } from './evaluation-cycle.js'
export type { EvaluationCycleConfig, CycleResult } from './evaluation-cycle.js'
```

- [ ] **Step 2: Build the llm package**

```bash
cd packages/llm && pnpm build
```

Expected: `packages/llm/dist/` created, no TypeScript errors.

- [ ] **Step 3: Write the integration smoke test**

Create `tests/smoke-llm.test.ts`:

```typescript
import { vi, describe, it, expect } from 'vitest'
import { TradingEngine } from '@trader/core'
import { Pipeline, NullDataSource } from '@trader/data'
import { EvaluationCycle, buildPrompt } from '@trader/llm'
import type { LLMAdapter } from '@trader/llm'
import type { TradingContext, LLMDecision } from '@trader/shared'

describe('LLM integration smoke test', () => {
  it('buildPrompt produces non-empty system and user strings', () => {
    const context: TradingContext = {
      snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
      positions: [],
      availableCapital: 500,
      recentTrades: [],
      openOrders: [],
    }
    const { system, user } = buildPrompt(context)
    expect(system.length).toBeGreaterThan(100)
    expect(user).toContain('500.00')
  })

  it('EvaluationCycle runs end-to-end with a stub adapter', async () => {
    const stubAdapter: LLMAdapter = {
      decide: async (_ctx: TradingContext): Promise<LLMDecision> => ({
        action: 'buy',
        coin: 'BTC/USDT',
        size: 50,
        confidence: 0.9,
        reasoning: 'stub decision',
      }),
    }

    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const engine = new TradingEngine({ totalCapital: 500, paper: true })

    const cycle = new EvaluationCycle({
      pipeline,
      adapter: stubAdapter,
      engine,
      autoTradeLimit: 100,
    })

    const result = await cycle.run()
    expect(result.executed).toBe(true)
    expect(result.decision.coin).toBe('BTC/USDT')
    expect(engine.getPositions()).toHaveLength(1)
    expect(engine.availableCapital()).toBe(450)
  })

  it('EvaluationCycle holds without executing when stub returns hold', async () => {
    const stubAdapter: LLMAdapter = {
      decide: async (): Promise<LLMDecision> => ({
        action: 'hold', coin: '', size: 0, confidence: 0.3, reasoning: 'uncertain',
      }),
    }

    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const engine = new TradingEngine({ totalCapital: 500, paper: true })

    const cycle = new EvaluationCycle({
      pipeline,
      adapter: stubAdapter,
      engine,
      autoTradeLimit: 100,
    })

    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(engine.getPositions()).toHaveLength(0)
  })
})
```

- [ ] **Step 4: Update root `vitest.config.ts` to resolve `@trader/llm`**

The current `vitest.config.ts` at `/Users/thanasisgliatis/git/trader/vitest.config.ts` uses directory aliases. Add `@trader/llm` in the same style:

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@trader/core': resolve(__dirname, './packages/core/dist'),
      '@trader/data': resolve(__dirname, './packages/data/dist'),
      '@trader/shared': resolve(__dirname, './packages/shared/dist'),
      '@trader/llm': resolve(__dirname, './packages/llm/dist'),
    },
  },
  test: {
    globals: true,
  },
})
```

- [ ] **Step 5: Build all packages and run integration smoke test**

```bash
cd /Users/thanasisgliatis/git/trader && pnpm build && pnpm test tests/smoke-llm.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: all tests across all packages pass (target: ~63 tests: 39 from Plan 1 + 8 prompt-builder + 5 claude + 5 openai + 6 evaluation-cycle + 3 smoke-llm).

- [ ] **Step 7: Commit**

```bash
git add packages/llm/src/index.ts tests/smoke-llm.test.ts vitest.config.ts
git commit -m "feat(llm): wire up index, build, and cross-package integration smoke test"
```

---

## What's Next

**Plan 2 delivers:** A fully model-agnostic LLM layer. Swap Claude for OpenAI (or any future adapter) by changing one config value. The EvaluationCycle is the core loop — run it on a schedule for live trading, or drive it deterministically with historical data for backtesting.

**Plan 3** builds the backtesting engine: a time-stepping replay harness that drives the same `EvaluationCycle` with historical Pipeline snapshots and simulated order fills, outputting P&L curves and trade logs.
