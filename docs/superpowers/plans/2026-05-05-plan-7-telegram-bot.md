# Telegram Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `@trader/bot` package that sends Telegram push notifications for trades and errors, and handles an interactive inline-keyboard approval flow for large trades that exceed `autoTradeLimit`.

**Architecture:** The `@trader/bot` package wraps grammy into three focused units: `BotNotifier` for one-way push alerts, `ApprovalManager` for the interactive approve/reject flow keyed by message ID, and command handlers for pull queries against `@trader/db`. The `packages/runner` `live-runner.ts` is the wiring layer — it starts the bot when Telegram env vars are present, passes `notifier` into `EvaluationCycle`, and routes large-trade decisions through `ApprovalManager` instead of auto-executing. `EvaluationCycle` gains an optional `notifier` parameter and calls it after every successful auto-trade.

**Tech Stack:** grammy ^1 (TypeScript-first Telegram Bot API client), `@trader/db` (botStateRepository for pause/resume state), vitest with `vi.fn()` mocks (no real Telegram API in tests)

---

## File Structure

```
packages/bot/
  src/
    notifier.ts          — BotNotifier: one-way push alerts
    approval-manager.ts  — ApprovalManager: inline-keyboard approval flow
    commands.ts          — grammy command handlers (/status, /pause, /resume, /capital)
    index.ts             — startBot(config) entry point
  tests/
    notifier.test.ts
    approval-manager.test.ts
    commands.test.ts
  package.json
  tsconfig.json

packages/llm/
  src/
    evaluation-cycle.ts  — MODIFIED: accept optional notifier, call after auto-trade

packages/runner/
  src/
    config.ts            — MODIFIED: add optional TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
    live-runner.ts       — MODIFIED: start bot, wire notifier + approvalManager
```

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/bot/package.json`
- Create: `packages/bot/tsconfig.json`

- [ ] **Step 1: Create `packages/bot/package.json`**

```json
{
  "name": "@trader/bot",
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
    "@trader/shared": "workspace:*",
    "@trader/db": "workspace:*",
    "grammy": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/bot/tsconfig.json`**

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

- [ ] **Step 3: Install dependencies**

```bash
cd /path/to/trader && pnpm install
```

- [ ] **Step 4: Commit scaffold**

```bash
git add packages/bot/package.json packages/bot/tsconfig.json
git commit -m "chore(bot): add @trader/bot package scaffold"
```

---

### Task 2: BotNotifier

**Files:**
- Create: `packages/bot/src/notifier.ts`
- Create: `packages/bot/tests/notifier.test.ts`

`BotNotifier` is a thin wrapper around a grammy `Bot` instance. It only sends messages — no command handling. The constructor accepts `botToken` and `chatId`; internally it creates a `Bot` instance. All `sendMessage` calls are fire-and-forget (`void`) — the caller is never blocked.

- [ ] **Step 1: Write failing tests**

Create `packages/bot/tests/notifier.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BotNotifier } from '../src/notifier.js'

// Mock grammy Bot so no real Telegram calls happen
vi.mock('grammy', () => {
  const sendMessage = vi.fn().mockResolvedValue({})
  const Bot = vi.fn().mockImplementation(() => ({
    api: { sendMessage },
  }))
  return { Bot }
})

import { Bot } from 'grammy'

function getApiMock() {
  // Retrieve the sendMessage mock from the most recently constructed Bot instance
  const instance = (Bot as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value as {
    api: { sendMessage: ReturnType<typeof vi.fn> }
  }
  return instance.api.sendMessage
}

describe('BotNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tradeExecuted sends a message containing coin, side, size, price and reasoning', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.tradeExecuted({
      coin: 'BTC/USDT',
      side: 'buy',
      size: 200,
      fillPrice: 50000,
      reasoning: 'Strong momentum',
    })

    expect(sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string]
    expect(chatId).toBe('123456')
    expect(text).toContain('BUY')
    expect(text).toContain('$200')
    expect(text).toContain('BTC/USDT')
    expect(text).toContain('50000')
    expect(text).toContain('Strong momentum')
  })

  it('tradeExecuted uppercases side', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.tradeExecuted({
      coin: 'ETH/USDT',
      side: 'sell',
      size: 100,
      fillPrice: 3000,
      reasoning: 'Take profit',
    })

    const [, text] = sendMessage.mock.calls[0] as [string, string]
    expect(text).toContain('SELL')
  })

  it('capitalAlert sends a message with deployed and total amounts', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.capitalAlert(850, 1000)

    expect(sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string]
    expect(chatId).toBe('123456')
    expect(text).toContain('850')
    expect(text).toContain('1000')
  })

  it('cycleError sends a message with the error message', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.cycleError(new Error('Rate limit hit'))

    expect(sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string]
    expect(chatId).toBe('123456')
    expect(text).toContain('Rate limit hit')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/bot && pnpm test
```

Expected: FAIL — `BotNotifier` not found.

- [ ] **Step 3: Create `packages/bot/src/notifier.ts`**

```typescript
import { Bot } from 'grammy'

export class BotNotifier {
  private readonly bot: Bot
  private readonly chatId: string

  constructor(botToken: string, chatId: string) {
    this.bot = new Bot(botToken)
    this.chatId = chatId
  }

  async tradeExecuted(trade: {
    coin: string
    side: 'buy' | 'sell'
    size: number
    fillPrice: number
    reasoning: string
  }): Promise<void> {
    const side = trade.side.toUpperCase()
    const text =
      `✅ AUTO-TRADE: ${side} $${trade.size} of ${trade.coin} @ ${trade.fillPrice}\n` +
      `Reason: ${trade.reasoning}`
    await this.bot.api.sendMessage(this.chatId, text)
  }

  async capitalAlert(deployed: number, total: number): Promise<void> {
    const pct = ((deployed / total) * 100).toFixed(1)
    const text =
      `⚠️ CAPITAL ALERT: ${pct}% deployed\n` +
      `Deployed: $${deployed} / Total: $${total}`
    await this.bot.api.sendMessage(this.chatId, text)
  }

  async cycleError(err: Error): Promise<void> {
    const text = `🚨 CYCLE ERROR: ${err.message}`
    await this.bot.api.sendMessage(this.chatId, text)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/trader/packages/bot && pnpm test -- --reporter=verbose notifier
```

Expected: all 4 notifier tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/notifier.ts packages/bot/tests/notifier.test.ts
git commit -m "feat(bot): BotNotifier — push alerts for trades, capital, and errors"
```

---

### Task 3: ApprovalManager

**Files:**
- Create: `packages/bot/src/approval-manager.ts`
- Create: `packages/bot/tests/approval-manager.test.ts`

`ApprovalManager` sends a grammy message with ✅/❌ inline buttons. Pending approvals are stored in a `Map<string, { resolve: (r: ApprovalResult) => void; timeout: ReturnType<typeof setTimeout> }>` keyed by the Telegram message ID (as a string). The `callback_query` handler reads `callbackQuery.data` (`'approve'` or `'reject'`) and the message ID from `callbackQuery.message.message_id`, looks up the pending entry, and resolves the promise. The timeout handler resolves with `'timeout'` and removes the entry from the Map.

- [ ] **Step 1: Write failing tests**

Create `packages/bot/tests/approval-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApprovalManager } from '../src/approval-manager.js'
import type { LLMDecision } from '@trader/shared'

// Mock grammy Bot — each Bot instance gets its own handlers array and sendMessage mock
vi.mock('grammy', () => {
  const Bot = vi.fn().mockImplementation(() => {
    const callbackHandlers: Array<(ctx: unknown) => Promise<void>> = []
    const sendMessage = vi.fn()
    return {
      api: { sendMessage },
      on: vi.fn((event: string, handler: (ctx: unknown) => Promise<void>) => {
        if (event === 'callback_query:data') callbackHandlers.push(handler)
      }),
      // Expose for test access
      _callbackHandlers: callbackHandlers,
    }
  })
  return {
    Bot,
    InlineKeyboard: vi.fn().mockImplementation(() => ({
      text: vi.fn().mockReturnThis(),
      row: vi.fn().mockReturnThis(),
    })),
  }
})

import { Bot } from 'grammy'

function getBotInstance() {
  return (Bot as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value as {
    api: { sendMessage: ReturnType<typeof vi.fn> }
    on: ReturnType<typeof vi.fn>
    _callbackHandlers: Array<(ctx: unknown) => Promise<void>>
  }
}

const mockDecision: LLMDecision = {
  action: 'buy',
  coin: 'ETH/USDT',
  size: 200,
  confidence: 0.82,
  reasoning: 'Strong on-chain inflow',
}

describe('ApprovalManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requestApproval resolves "approved" when ✅ button is pressed', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    const messageId = 42
    bot.api.sendMessage.mockResolvedValue({ message_id: messageId })

    const promise = manager.requestApproval(mockDecision)

    // Simulate callback_query for approve
    await bot._callbackHandlers[0]?.({
      callbackQuery: {
        data: 'approve',
        message: { message_id: messageId },
      },
      answerCallbackQuery: vi.fn(),
    })

    await expect(promise).resolves.toBe('approved')
  })

  it('requestApproval resolves "rejected" when ❌ button is pressed', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    const messageId = 43
    bot.api.sendMessage.mockResolvedValue({ message_id: messageId })

    const promise = manager.requestApproval(mockDecision)

    await bot._callbackHandlers[0]?.({
      callbackQuery: {
        data: 'reject',
        message: { message_id: messageId },
      },
      answerCallbackQuery: vi.fn(),
    })

    await expect(promise).resolves.toBe('rejected')
  })

  it('requestApproval resolves "timeout" after timeoutMs with no interaction', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 5_000 })
    const bot = getBotInstance()
    bot.api.sendMessage.mockResolvedValue({ message_id: 44 })

    const promise = manager.requestApproval(mockDecision)

    vi.advanceTimersByTime(5_000)

    await expect(promise).resolves.toBe('timeout')
  })

  it('sends message containing coin, size, confidence and reasoning', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    bot.api.sendMessage.mockResolvedValue({ message_id: 45 })

    // Don't await — just check the send call
    void manager.requestApproval(mockDecision)

    // Allow the async sendMessage to be called
    await Promise.resolve()

    expect(bot.api.sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = bot.api.sendMessage.mock.calls[0] as [string, string, unknown]
    expect(chatId).toBe('123456')
    expect(text).toContain('ETH/USDT')
    expect(text).toContain('200')
    expect(text).toContain('0.82')
    expect(text).toContain('Strong on-chain inflow')
  })

  it('removes pending entry from Map after resolution so a second callback is ignored', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    const messageId = 46
    bot.api.sendMessage.mockResolvedValue({ message_id: messageId })

    const promise = manager.requestApproval(mockDecision)
    const ctx = {
      callbackQuery: { data: 'approve', message: { message_id: messageId } },
      answerCallbackQuery: vi.fn(),
    }

    await bot._callbackHandlers[0]?.(ctx)
    // Second call — should not throw or re-resolve
    await bot._callbackHandlers[0]?.(ctx)

    await expect(promise).resolves.toBe('approved')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/bot && pnpm test -- --reporter=verbose approval-manager
```

Expected: FAIL — `ApprovalManager` not found.

- [ ] **Step 3: Create `packages/bot/src/approval-manager.ts`**

```typescript
import { Bot, InlineKeyboard } from 'grammy'
import type { LLMDecision } from '@trader/shared'

export type ApprovalResult = 'approved' | 'rejected' | 'timeout'

interface PendingApproval {
  resolve: (result: ApprovalResult) => void
  timeout: ReturnType<typeof setTimeout>
}

interface ApprovalManagerConfig {
  timeoutMs?: number
}

export class ApprovalManager {
  private readonly bot: Bot
  private readonly chatId: string
  private readonly timeoutMs: number
  private readonly pending = new Map<string, PendingApproval>()

  constructor(botToken: string, chatId: string, config: ApprovalManagerConfig = {}) {
    this.bot = new Bot(botToken)
    this.chatId = chatId
    this.timeoutMs = config.timeoutMs ?? 10 * 60 * 1000 // 10 minutes default

    this.bot.on('callback_query:data', async ctx => {
      const messageId = String(ctx.callbackQuery.message?.message_id)
      const entry = this.pending.get(messageId)
      if (!entry) return

      clearTimeout(entry.timeout)
      this.pending.delete(messageId)

      const result: ApprovalResult = ctx.callbackQuery.data === 'approve' ? 'approved' : 'rejected'
      entry.resolve(result)
      await ctx.answerCallbackQuery()
    })
  }

  async requestApproval(decision: LLMDecision): Promise<ApprovalResult> {
    const keyboard = new InlineKeyboard()
      .text('✅ Approve', 'approve')
      .text('❌ Reject', 'reject')

    const text =
      `🔔 APPROVAL NEEDED: ${decision.action.toUpperCase()} $${decision.size} of ${decision.coin}\n` +
      `Confidence: ${decision.confidence}\n` +
      `Reason: ${decision.reasoning}`

    const message = await this.bot.api.sendMessage(this.chatId, text, {
      reply_markup: keyboard,
    })

    return new Promise<ApprovalResult>(resolve => {
      const timeout = setTimeout(() => {
        const key = String(message.message_id)
        if (this.pending.has(key)) {
          this.pending.delete(key)
          resolve('timeout')
        }
      }, this.timeoutMs)

      this.pending.set(String(message.message_id), { resolve, timeout })
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/trader/packages/bot && pnpm test -- --reporter=verbose approval-manager
```

Expected: all 5 approval-manager tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/approval-manager.ts packages/bot/tests/approval-manager.test.ts
git commit -m "feat(bot): ApprovalManager — inline-keyboard approval flow with timeout"
```

---

### Task 4: Bot commands

**Files:**
- Create: `packages/bot/src/commands.ts`
- Create: `packages/bot/tests/commands.test.ts`

Command handlers read from `@trader/db` (`botStateRepository`) for `/pause` and `/resume`, and query position/capital data for `/status` and `/capital`. For Plan 7 scope, `/status` and `/capital` are satisfied by reading from `botStateRepository` keys set by the runner (the runner stores a snapshot after each cycle — see integration task). Each handler receives a grammy `Context` and calls `ctx.reply(...)`.

- [ ] **Step 1: Write failing tests**

Create `packages/bot/tests/commands.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerCommands } from '../src/commands.js'

// Mock @trader/db
vi.mock('@trader/db', () => ({
  botStateRepository: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  },
}))

import { botStateRepository } from '@trader/db'

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    reply: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
}

function makeBot() {
  const handlers = new Map<string, (ctx: unknown) => Promise<void>>()
  return {
    command: vi.fn((cmd: string, handler: (ctx: unknown) => Promise<void>) => {
      handlers.set(cmd, handler)
    }),
    _trigger: async (cmd: string, ctx: unknown) => {
      const handler = handlers.get(cmd)
      if (!handler) throw new Error(`No handler for /${cmd}`)
      await handler(ctx)
    },
  }
}

describe('registerCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('/pause sets paused=true in botStateRepository and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as Parameters<typeof registerCommands>[0])
    const ctx = makeCtx()

    await bot._trigger('pause', ctx)

    expect(botStateRepository.set).toHaveBeenCalledWith('paused', true)
    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg.toLowerCase()).toContain('pause')
  })

  it('/resume sets paused=false in botStateRepository and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as Parameters<typeof registerCommands>[0])
    const ctx = makeCtx()

    await bot._trigger('resume', ctx)

    expect(botStateRepository.set).toHaveBeenCalledWith('paused', false)
    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg.toLowerCase()).toContain('resum')
  })

  it('/status reads positions and pnl from botStateRepository and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as Parameters<typeof registerCommands>[0])
    const ctx = makeCtx()
    ;(botStateRepository.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key === 'positions') return [{ coin: 'BTC/USDT' }, { coin: 'ETH/USDT' }]
      if (key === 'totalPnl') return 42.5
      return null
    })

    await bot._trigger('status', ctx)

    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg).toContain('2') // 2 open positions
    expect(msg).toContain('42.5')
  })

  it('/status handles null DB values gracefully', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as Parameters<typeof registerCommands>[0])
    const ctx = makeCtx()
    ;(botStateRepository.get as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await bot._trigger('status', ctx)

    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg).toContain('0') // 0 positions, $0 P&L
  })

  it('/capital reads deployedCapital and totalCapital from botStateRepository and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as Parameters<typeof registerCommands>[0])
    const ctx = makeCtx()
    ;(botStateRepository.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key === 'deployedCapital') return 750
      if (key === 'totalCapital') return 1000
      return null
    })

    await bot._trigger('capital', ctx)

    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg).toContain('750')
    expect(msg).toContain('1000')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/bot && pnpm test -- --reporter=verbose commands
```

Expected: FAIL — `registerCommands` not found.

- [ ] **Step 3: Create `packages/bot/src/commands.ts`**

```typescript
import type { Bot } from 'grammy'
import { botStateRepository } from '@trader/db'
import type { Position } from '@trader/shared'

export function registerCommands(bot: Bot): void {
  bot.command('pause', async ctx => {
    await botStateRepository.set('paused', true)
    await ctx.reply('⏸️ Trading paused. Use /resume to restart.')
  })

  bot.command('resume', async ctx => {
    await botStateRepository.set('paused', false)
    await ctx.reply('▶️ Trading resumed.')
  })

  bot.command('status', async ctx => {
    const [rawPositions, rawPnl] = await Promise.all([
      botStateRepository.get('positions'),
      botStateRepository.get('totalPnl'),
    ])
    const positions = (rawPositions as Position[] | null) ?? []
    const pnl = (rawPnl as number | null) ?? 0

    await ctx.reply(
      `📊 Status\n` +
        `Open positions: ${positions.length}\n` +
        `Total P&L: $${pnl.toFixed(2)}`,
    )
  })

  bot.command('capital', async ctx => {
    const [rawDeployed, rawTotal] = await Promise.all([
      botStateRepository.get('deployedCapital'),
      botStateRepository.get('totalCapital'),
    ])
    const deployed = (rawDeployed as number | null) ?? 0
    const total = (rawTotal as number | null) ?? 0
    const available = total - deployed
    const pct = total > 0 ? ((deployed / total) * 100).toFixed(1) : '0.0'

    await ctx.reply(
      `💰 Capital\n` +
        `Deployed: $${deployed} (${pct}%)\n` +
        `Available: $${available}\n` +
        `Total: $${total}`,
    )
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/trader/packages/bot && pnpm test -- --reporter=verbose commands
```

Expected: all 5 command tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/commands.ts packages/bot/tests/commands.test.ts
git commit -m "feat(bot): command handlers for /status, /pause, /resume, /capital"
```

---

### Task 5: startBot entry point

**Files:**
- Create: `packages/bot/src/index.ts`

`startBot` creates a grammy `Bot` for command handling and starts long polling. `BotNotifier` and `ApprovalManager` each create their own internal `Bot` instances; they only call `bot.api.*` (REST), not long polling, so there is only one active WebSocket/SSE connection (the one started via `bot.start()`). This keeps each class independently testable without a shared mutable bot reference. The `index.ts` re-exports `BotNotifier` and `ApprovalManager` so the runner imports only from `@trader/bot`.

Note: this entry point is not unit-tested directly (it wires live dependencies). Integration is verified in Task 7.

- [ ] **Step 1: Create `packages/bot/src/index.ts`**

```typescript
import { Bot } from 'grammy'
import { BotNotifier } from './notifier.js'
import { ApprovalManager } from './approval-manager.js'
import { registerCommands } from './commands.js'

export interface BotConfig {
  botToken: string
  chatId: string
  approvalTimeoutMs?: number
}

export interface BotHandle {
  stop(): void
  notifier: BotNotifier
  approvalManager: ApprovalManager
}

export function startBot(config: BotConfig): BotHandle {
  const bot = new Bot(config.botToken)

  const notifier = new BotNotifier(config.botToken, config.chatId)
  const approvalManager = new ApprovalManager(config.botToken, config.chatId, {
    timeoutMs: config.approvalTimeoutMs,
  })

  registerCommands(bot)

  // Start long polling (non-blocking)
  void bot.start()

  return {
    stop: () => void bot.stop(),
    notifier,
    approvalManager,
  }
}

export { BotNotifier } from './notifier.js'
export { ApprovalManager } from './approval-manager.js'
export type { ApprovalResult } from './approval-manager.js'
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /path/to/trader/packages/bot && pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run all bot tests to confirm nothing is broken**

```bash
cd /path/to/trader/packages/bot && pnpm test
```

Expected: all tests PASS (notifier × 4, approval-manager × 5, commands × 5).

- [ ] **Step 4: Commit**

```bash
git add packages/bot/src/index.ts
git commit -m "feat(bot): startBot entry point — wires grammy bot, notifier, approvalManager, commands"
```

---

### Task 6: EvaluationCycle — add optional notifier

**Files:**
- Modify: `packages/llm/src/evaluation-cycle.ts`
- Modify: `packages/llm/tests/evaluation-cycle.test.ts`

The `notifier` is passed in via `EvaluationCycleConfig` as an optional interface. `EvaluationCycle` does not import `@trader/bot` to avoid a circular dependency — instead it accepts a structural `NotifierLike` interface.

- [ ] **Step 1: Write failing tests**

Add to `packages/llm/tests/evaluation-cycle.test.ts` (appended after the existing `describe` block). The existing file already has module-level `mockFetch`, `mockDecide`, `mockExecute`, `mockPipeline`, `mockAdapter`, `mockEngine` — reuse them:

```typescript
import type { CycleResult } from '../src/evaluation-cycle.js'

// Appended after the existing describe block — reuses module-level mocks
describe('EvaluationCycle with notifier', () => {
  function makeNotifier() {
    return {
      tradeExecuted: vi.fn().mockResolvedValue(undefined),
      capitalAlert: vi.fn().mockResolvedValue(undefined),
      cycleError: vi.fn().mockResolvedValue(undefined),
    }
  }

  beforeEach(() => {
    mockFetch.mockResolvedValue(emptySnapshot)
    mockDecide.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue({ executed: true, order: { fillPrice: 50000 } })
    mockEngine.getPositions.mockReturnValue([])
    mockEngine.availableCapital.mockReturnValue(1000)
  })

  it('calls notifier.tradeExecuted after a successful auto-trade', async () => {
    mockDecide.mockResolvedValue(buySmall)
    const notifier = makeNotifier()
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 100,
      notifier,
    })

    const result: CycleResult = await cycle.run()

    expect(result.executed).toBe(true)
    expect(notifier.tradeExecuted).toHaveBeenCalledOnce()
    const call = notifier.tradeExecuted.mock.calls[0][0] as {
      coin: string; side: string; size: number; fillPrice: number; reasoning: string
    }
    expect(call.coin).toBe('BTC/USDT')
    expect(call.side).toBe('buy')
    expect(call.size).toBe(30)
    expect(call.reasoning).toBe('strong')
  })

  it('does not call notifier.tradeExecuted when decision is hold', async () => {
    mockDecide.mockResolvedValue(holdDecision)
    const notifier = makeNotifier()
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 100,
      notifier,
    })

    await cycle.run()

    expect(notifier.tradeExecuted).not.toHaveBeenCalled()
  })

  it('does not call notifier.tradeExecuted when approval is rejected', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const notifier = makeNotifier()
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 50,
      onApprovalNeeded: async () => false,
      notifier,
    })

    await cycle.run()

    expect(notifier.tradeExecuted).not.toHaveBeenCalled()
  })

  it('works without a notifier (backwards compatible)', async () => {
    mockDecide.mockResolvedValue(buySmall)
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 100,
    })

    await expect(cycle.run()).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/llm && pnpm test
```

Expected: FAIL — `EvaluationCycleConfig` does not accept `notifier`.

- [ ] **Step 3: Update `packages/llm/src/evaluation-cycle.ts`**

Replace the full file:

```typescript
import type { LLMDecision, TradingContext, WorldSnapshot, Position, Order } from '@trader/shared'
import type { LLMAdapter } from './adapters/base.js'

interface PipelineLike {
  fetch(): Promise<WorldSnapshot>
}

interface EngineLike {
  execute(decision: LLMDecision): Promise<{ executed: boolean; reason?: string; order?: { fillPrice?: number; side?: string } }>
  updatePositionPrice(coin: string, price: number): void
  getPositions(): Position[]
  getOpenOrders(): Order[]
  availableCapital(): number
}

export interface NotifierLike {
  tradeExecuted(trade: {
    coin: string
    side: 'buy' | 'sell'
    size: number
    fillPrice: number
    reasoning: string
  }): Promise<void>
}

export interface EvaluationCycleConfig {
  pipeline: PipelineLike
  adapter: LLMAdapter
  engine: EngineLike
  autoTradeLimit: number
  onApprovalNeeded?: (decision: LLMDecision) => Promise<boolean>
  notifier?: NotifierLike
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
    const { pipeline, adapter, engine, autoTradeLimit, onApprovalNeeded, notifier } = this.config

    const snapshot = await pipeline.fetch()
    const context: TradingContext = {
      snapshot,
      positions: engine.getPositions(),
      availableCapital: engine.availableCapital(),
      recentTrades: [],
      openOrders: engine.getOpenOrders(),
    }

    // Update position prices from latest candle closes
    for (const [coin, candles] of Object.entries(snapshot.ohlcv)) {
      const lastCandle = candles[candles.length - 1]
      if (lastCandle) {
        engine.updatePositionPrice(coin, lastCandle.close)
      }
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

    if (result.executed && notifier) {
      await notifier.tradeExecuted({
        coin: decision.coin,
        side: decision.action as 'buy' | 'sell',
        size: decision.size,
        fillPrice: result.order?.fillPrice ?? 0,
        reasoning: decision.reasoning,
      })
    }

    return { decision, executed: result.executed, reason: result.reason }
  }
}
```

- [ ] **Step 4: Run all llm tests to verify they pass**

```bash
cd /path/to/trader/packages/llm && pnpm test
```

Expected: all tests PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/evaluation-cycle.ts packages/llm/tests/evaluation-cycle.test.ts
git commit -m "feat(llm): EvaluationCycle accepts optional notifier, calls tradeExecuted after auto-trade"
```

---

### Task 7: Runner integration

**Files:**
- Modify: `packages/runner/src/config.ts`
- Modify: `packages/runner/src/live-runner.ts`
- Modify: `packages/runner/tests/config.test.ts`

Add optional `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` env vars to `loadConfig()`. Update `live-runner.ts` to start the bot when both are set, pass `notifier` to `EvaluationCycle`, and route decisions above `autoTradeLimit` through `approvalManager.requestApproval()`.

- [ ] **Step 1: Write failing config tests**

Add to `packages/runner/tests/config.test.ts`:

```typescript
  it('includes telegramBotToken and telegramChatId as undefined when not set', () => {
    withEnv(requiredEnv, () => {
      const config = loadConfig()
      expect(config.telegramBotToken).toBeUndefined()
      expect(config.telegramChatId).toBeUndefined()
    })
  })

  it('reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID when set', () => {
    withEnv({
      ...requiredEnv,
      TELEGRAM_BOT_TOKEN: 'bot123:token',
      TELEGRAM_CHAT_ID: '987654',
    }, () => {
      const config = loadConfig()
      expect(config.telegramBotToken).toBe('bot123:token')
      expect(config.telegramChatId).toBe('987654')
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/trader/packages/runner && pnpm test
```

Expected: FAIL — `loadConfig()` result has no `telegramBotToken` or `telegramChatId`.

- [ ] **Step 3: Update `packages/runner/src/config.ts`**

Replace the full file:

```typescript
export interface LiveConfig {
  binanceApiKey: string
  binanceSecret: string
  anthropicApiKey: string
  totalCapital: number
  autoTradeLimit: number
  coins: string[]
  timeframe: string
  ohlcvLimit: number
  cronExpression: string
  paper: boolean
  telegramBotToken?: string
  telegramChatId?: string
}

export function loadConfig(): LiveConfig {
  function required(key: string): string {
    const val = process.env[key]
    if (!val) throw new Error(`Missing required env var: ${key}`)
    return val
  }

  function parseNumber(key: string, defaultValue: number, minValue = 0): number {
    const raw = process.env[key]
    if (raw === undefined) return defaultValue
    const val = Number(raw)
    if (isNaN(val) || val <= minValue) throw new Error(`${key} must be a number greater than ${minValue}, got "${raw}"`)
    return val
  }

  return {
    binanceApiKey: required('BINANCE_API_KEY'),
    binanceSecret: required('BINANCE_SECRET'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    totalCapital: parseNumber('TOTAL_CAPITAL', 1000, 0),
    autoTradeLimit: parseNumber('AUTO_TRADE_LIMIT', 50, 0),
    coins: (process.env['COINS'] ?? 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env['TIMEFRAME'] ?? '15m',
    ohlcvLimit: parseNumber('OHLCV_LIMIT', 100, 0),
    cronExpression: process.env['CRON_EXPRESSION'] ?? '*/15 * * * *',
    paper: process.env['PAPER'] !== 'false',
    telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'],
    telegramChatId: process.env['TELEGRAM_CHAT_ID'],
  }
}
```

- [ ] **Step 4: Run runner tests to verify all pass**

```bash
cd /path/to/trader/packages/runner && pnpm test
```

Expected: all tests PASS (existing + 2 new).

- [ ] **Step 5: Update `packages/runner/src/live-runner.ts`**

Replace the full file:

```typescript
import ccxt from 'ccxt'
import { ClaudeAdapter, EvaluationCycle } from '@trader/llm'
import { TradingEngine, CcxtExchangeAdapter } from '@trader/core'
import { Pipeline, BinanceSource } from '@trader/data'
import { startBot } from '@trader/bot'
import { Scheduler } from './scheduler.js'
import type { LiveConfig } from './config.js'

export interface LiveTraderHandle {
  stop(): void
}

export function startLiveTrader(config: LiveConfig): LiveTraderHandle {
  const binanceExchange = new ccxt.binance({
    apiKey: config.binanceApiKey,
    secret: config.binanceSecret,
  })

  // ccxt's OHLCV type uses `Num` (number | undefined) but in practice values are always numbers;
  // cast to satisfy the narrower ExchangeLike interface expected by BinanceSource
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binanceSource = new BinanceSource(binanceExchange as any)

  const pipeline = new Pipeline({
    sources: [],
    ohlcvSource: binanceSource,
    coins: config.coins,
    timeframe: config.timeframe,
    ohlcvLimit: config.ohlcvLimit,
  })

  const exchangeAdapter = config.paper ? undefined : new CcxtExchangeAdapter(binanceExchange)

  const engine = new TradingEngine({
    totalCapital: config.totalCapital,
    paper: config.paper,
    exchange: exchangeAdapter,
  })

  const llmAdapter = new ClaudeAdapter({ apiKey: config.anthropicApiKey })

  // Start Telegram bot if configured
  const botHandle =
    config.telegramBotToken && config.telegramChatId
      ? startBot({
          botToken: config.telegramBotToken,
          chatId: config.telegramChatId,
        })
      : undefined

  const { notifier, approvalManager } = botHandle ?? {}

  const cycle = new EvaluationCycle({
    pipeline,
    adapter: llmAdapter,
    engine,
    autoTradeLimit: config.autoTradeLimit,
    notifier,
    onApprovalNeeded: approvalManager
      ? async decision => {
          const result = await approvalManager.requestApproval(decision)
          return result === 'approved'
        }
      : undefined,
  })

  const scheduler = new Scheduler(cycle, config.cronExpression)
  scheduler.start()

  console.log(
    `[LiveTrader] Started. paper=${config.paper}, coins=${config.coins.join(',')}, cron="${config.cronExpression}"`,
    botHandle ? '| Telegram bot active' : '| Telegram bot disabled',
  )

  return {
    stop: () => {
      scheduler.stop()
      botHandle?.stop()
    },
  }
}
```

- [ ] **Step 6: Add `@trader/bot` to runner's package.json dependencies**

In `packages/runner/package.json`, add to `"dependencies"`:

```json
"@trader/bot": "workspace:*"
```

- [ ] **Step 7: Build all packages in dependency order and run full test suite**

```bash
cd /path/to/trader
pnpm install
pnpm --filter '@trader/shared' build
pnpm --filter '@trader/db' build
pnpm --filter '@trader/core' build
pnpm --filter '@trader/data' build
pnpm --filter '@trader/llm' build
pnpm --filter '@trader/bot' build
pnpm --filter '@trader/runner' build
pnpm --filter './packages/**' test
```

Expected: all packages build and all tests pass.

- [ ] **Step 8: Add `@trader/bot` alias to root `vitest.config.ts`**

In the root `vitest.config.ts`, add alongside existing aliases:

```typescript
'@trader/bot': resolve(__dirname, './packages/bot/dist'),
```

- [ ] **Step 9: Commit runner integration**

```bash
git add packages/runner/src/config.ts packages/runner/src/live-runner.ts packages/runner/tests/config.test.ts packages/runner/package.json vitest.config.ts
git commit -m "feat(runner): integrate Telegram bot — start bot when env vars present, wire notifier and approval flow"
```

---

## Environment Variables Summary

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | No | — | grammy bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | No | — | Telegram chat ID for push notifications and approvals |

Both must be set to enable the bot. If either is absent, the system runs without Telegram (existing behaviour preserved).

## Wiring Diagram

```
Scheduler
  └─ EvaluationCycle.run()
       ├─ [trade ≤ autoTradeLimit] → engine.execute() → notifier.tradeExecuted()
       └─ [trade > autoTradeLimit] → approvalManager.requestApproval()
                                         ├─ 'approved' → engine.execute() → notifier.tradeExecuted()
                                         ├─ 'rejected' → skip
                                         └─ 'timeout'  → skip

Bot (long-poll, concurrent)
  ├─ /status   → botStateRepository.get('positions') + get('totalPnl')
  ├─ /pause    → botStateRepository.set('paused', true)
  ├─ /resume   → botStateRepository.set('paused', false)
  └─ /capital  → botStateRepository.get('deployedCapital') + get('totalCapital')
```
