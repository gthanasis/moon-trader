#!/usr/bin/env node
// Usage: node scripts/review-run.mjs <partial-run-id>
// Shows a concise summary of a backtest run: params, decision breakdown, trades, stats.

import { execSync } from 'child_process'

const partial = process.argv[2]
if (!partial) {
  console.error('Usage: node scripts/review-run.mjs <partial-run-id>')
  process.exit(1)
}

const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/trader'

function sql(query) {
  // Run via docker exec if psql not available locally
  try {
    return execSync(`psql "${DB}" -t -A -F '|' -c "${query.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    // fallback: docker
    return execSync(`docker exec -i $(docker ps --filter name=postgres -q | head -1) psql -U postgres trader -t -A -F '|' -c "${query.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
}

// Find run by partial ID prefix
const idRow = sql(`SELECT id FROM "BacktestRun" WHERE id LIKE '${partial}%' ORDER BY "createdAt" DESC LIMIT 1`).trim()
if (!idRow) {
  console.error(`No run found matching: ${partial}`)
  process.exit(1)
}
const id = idRow

// Fetch full run
const row = sql(`
  SELECT
    id, status, model, coins::text, "intervalMs", "from", "to", "initialCapital",
    "createdAt",
    jsonb_array_length(COALESCE(decisions, '[]'::jsonb)) AS decision_count,
    jsonb_array_length(COALESCE(trades, '[]'::jsonb)) AS trade_count,
    stats::text,
    "errorMessage",
    decisions::text,
    trades::text
  FROM "BacktestRun"
  WHERE id = '${id}'
`).trim()

if (!row) {
  console.error(`Run not found: ${id}`)
  process.exit(1)
}

const cols = row.split('|')
const [
  , status, model, coinsRaw, intervalMs, from, to, capital,
  createdAt, decisionCount, tradeCount, statsRaw, errorMsg,
  decisionsRaw, tradesRaw,
] = cols

const decisions = JSON.parse(decisionsRaw || '[]')
const trades = JSON.parse(tradesRaw || '[]')
const stats = JSON.parse(statsRaw || 'null')
// Postgres array literal: {BTC/USDT,ETH/USDT} → ["BTC/USDT","ETH/USDT"]
const coins = (coinsRaw || '').replace(/^\{|\}$/g, '').split(',').filter(Boolean)
const intervalH = (Number(intervalMs) / 3600000).toFixed(1)

// Decision breakdown
const counts = { buy: 0, sell: 0, hold: 0 }
const confidences = []
for (const d of decisions) {
  counts[d.action] = (counts[d.action] || 0) + 1
  if (typeof d.confidence === 'number') confidences.push(d.confidence)
}
const avgConf = confidences.length ? (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3) : 'n/a'
const maxConf = confidences.length ? Math.max(...confidences).toFixed(3) : 'n/a'

// Confidence distribution buckets
const buckets = { '0.0–0.3': 0, '0.3–0.5': 0, '0.5–0.7': 0, '0.7–1.0': 0 }
for (const c of confidences) {
  if (c < 0.3) buckets['0.0–0.3']++
  else if (c < 0.5) buckets['0.3–0.5']++
  else if (c < 0.7) buckets['0.5–0.7']++
  else buckets['0.7–1.0']++
}

// Trade summary
const closedTrades = trades.filter(t => t.closedAt)
const winningTrades = closedTrades.filter(t => (t.pnl ?? 0) > 0)
const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)

// Sample decisions (last 5)
const sampleDecisions = decisions.slice(-5)

console.log('\n' + '═'.repeat(70))
console.log(`  BACKTEST RUN: ${id}`)
console.log('═'.repeat(70))
console.log(`  Status    : ${status}${errorMsg ? ' — ' + errorMsg : ''}`)
console.log(`  Created   : ${createdAt}`)
console.log(`  Period    : ${from?.slice(0, 10)} → ${to?.slice(0, 10)}`)
console.log(`  Coins     : ${coins.join(', ')}`)
console.log(`  Model     : ${model}`)
console.log(`  Interval  : ${intervalMs}ms (${intervalH}h)`)
console.log(`  Capital   : $${Number(capital).toFixed(2)}`)

console.log('\n  DECISIONS')
console.log('─'.repeat(70))
console.log(`  Total: ${decisionCount}  |  Buy: ${counts.buy}  |  Sell: ${counts.sell}  |  Hold: ${counts.hold}`)
console.log(`  Avg confidence: ${avgConf}  |  Max confidence: ${maxConf}`)
console.log(`  Distribution: ${Object.entries(buckets).map(([k, v]) => `${k}: ${v}`).join('  ')}`)

console.log('\n  TRADES')
console.log('─'.repeat(70))
console.log(`  Total: ${tradeCount}  |  Closed: ${closedTrades.length}  |  Wins: ${winningTrades.length}`)
if (closedTrades.length > 0) {
  console.log(`  Total PnL: $${totalPnl.toFixed(2)}`)
  console.log(`  Win rate: ${((winningTrades.length / closedTrades.length) * 100).toFixed(1)}%`)
  for (const t of closedTrades) {
    const pnlStr = t.pnl !== undefined ? ` PnL: $${t.pnl.toFixed(2)}` : ''
    console.log(`    ${t.side.toUpperCase()} ${t.coin} $${t.size} @ $${t.entryPrice} → $${t.exitPrice ?? '?'}${pnlStr}`)
  }
}

if (stats) {
  console.log('\n  STATS')
  console.log('─'.repeat(70))
  console.log(`  Total PnL  : $${Number(stats.totalPnl).toFixed(2)}`)
  console.log(`  Win rate   : ${(Number(stats.winRate) * 100).toFixed(1)}%`)
  console.log(`  Max drawdown: ${(Number(stats.maxDrawdown) * 100).toFixed(2)}%`)
  console.log(`  Sharpe     : ${Number(stats.sharpeRatio).toFixed(3)}`)
  console.log(`  Avg hold   : ${(Number(stats.avgHoldTimeMs) / 3600000).toFixed(1)}h`)
}

if (sampleDecisions.length > 0) {
  console.log('\n  LAST 5 DECISIONS')
  console.log('─'.repeat(70))
  for (const d of sampleDecisions) {
    const ts = d.timestamp?.slice(0, 16).replace('T', ' ')
    const reason = d.reasoning?.slice(0, 100) ?? ''
    console.log(`  [${ts}] ${d.action.toUpperCase().padEnd(4)} conf:${d.confidence?.toFixed(2) ?? '?'} — ${reason}`)
  }
}

console.log('\n' + '═'.repeat(70) + '\n')
