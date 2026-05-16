'use client'

import { useState } from 'react'
import { useDecisions } from '@/lib/queries'
import { useLiveEvents } from '@/lib/use-app-events'
import type { AppEvent, StoredDecision } from '@/lib/api-client'

interface FeedItem {
  key: string
  at: number
  label: string
  text: string
  tone: string
}

const TONE: Record<string, string> = {
  buy: 'var(--pos)', sell: 'var(--warn)', hold: 'var(--muted)',
}

function eventToItem(e: AppEvent, i: number): FeedItem {
  const at = new Date(e.at).getTime()
  const p = e.payload
  switch (e.type) {
    case 'cycle_started':
      return { key: `e${i}`, at, label: 'CYCLE', text: 'Evaluation cycle started', tone: 'var(--info)' }
    case 'decision_made':
      return {
        key: `e${i}`, at, label: String(p['action'] ?? '').toUpperCase() || 'DECISION',
        text: `${p['coin'] ?? ''} — ${p['reasoning'] ?? ''}`,
        tone: TONE[String(p['action'])] ?? 'var(--fg)',
      }
    case 'trade_opened':
      return { key: `e${i}`, at, label: 'OPENED', text: `${p['coin']} $${p['size']}`, tone: 'var(--pos)' }
    case 'trade_closed':
      return {
        key: `e${i}`, at, label: 'CLOSED',
        text: `${p['coin']} — ${p['reason']} (pnl ${Number(p['pnl'] ?? 0).toFixed(2)})`,
        tone: Number(p['pnl'] ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)',
      }
    case 'signals_ingested':
      return { key: `e${i}`, at, label: 'SIGNALS', text: `${p['count']} new signals`, tone: 'var(--muted)' }
    default:
      return { key: `e${i}`, at, label: 'EVENT', text: e.type, tone: 'var(--muted)' }
  }
}

function decisionToItem(d: StoredDecision): FeedItem {
  return {
    key: `d${d.id}`,
    at: new Date(d.decidedAt).getTime(),
    label: d.action.toUpperCase(),
    text: `${d.coin} — ${d.reasoning}`,
    tone: TONE[d.action] ?? 'var(--fg)',
  }
}

/** A single feed entry, or a collapsed run of consecutive HOLD decisions. */
type Row =
  | { kind: 'item'; item: FeedItem }
  | { kind: 'holds'; id: string; items: FeedItem[] }

/** Folds consecutive HOLD items into one collapsible group. */
function toRows(items: FeedItem[]): Row[] {
  const rows: Row[] = []
  let run: FeedItem[] = []
  const flush = () => {
    if (run.length === 1) rows.push({ kind: 'item', item: run[0] })
    else if (run.length > 1) rows.push({ kind: 'holds', id: run[0].key, items: run })
    run = []
  }
  for (const item of items) {
    if (item.label === 'HOLD') {
      run.push(item)
    } else {
      flush()
      rows.push({ kind: 'item', item })
    }
  }
  flush()
  return rows
}

function fmtTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

/**
 * Real-time bot activity. Buy/sell/trade events stay individual and
 * colour-coded with their reasoning; runs of HOLD decisions collapse into a
 * group that expands on click.
 */
export function LiveActivityFeed() {
  const { data: decisions = [] } = useDecisions(20)
  const events = useLiveEvents()
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const items: FeedItem[] = [
    ...events.map(eventToItem),
    ...decisions.map(decisionToItem),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 40)

  const rows = toRows(items)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '10px' }}>Live Activity</div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rows.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '11px' }}>Waiting for the bot to act…</p>
        )}
        {rows.map(row =>
          row.kind === 'item' ? (
            <ActivityCard key={row.item.key} item={row.item} />
          ) : (
            <HoldGroup
              key={row.id}
              items={row.items}
              open={!!open[row.id]}
              onToggle={() => setOpen(o => ({ ...o, [row.id]: !o[row.id] }))}
            />
          ),
        )}
      </div>
    </div>
  )
}

function ActivityCard({ item }: { item: FeedItem }) {
  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: `3px solid ${item.tone}`, borderRadius: 'var(--r)', padding: '7px 10px',
      }}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', fontFamily: 'monospace', fontSize: '11px' }}>
        <span style={{ color: item.tone, fontWeight: 700, flexShrink: 0 }}>{item.label}</span>
        <span style={{ color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0, fontSize: '9.5px' }}>
          {fmtTime(item.at)}
        </span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: '10.5px', lineHeight: 1.5, marginTop: '2px' }}>
        {item.text}
      </div>
    </div>
  )
}

/** A collapsed run of HOLD decisions — one row that expands to the full cards. */
function HoldGroup({
  items, open, onToggle,
}: { items: FeedItem[]; open: boolean; onToggle: () => void }) {
  const newest = items[0].at
  const oldest = items[items.length - 1].at

  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: '3px solid var(--muted)', borderRadius: 'var(--r)',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'baseline', gap: '8px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '7px 10px', color: 'var(--fg)', fontFamily: 'monospace', fontSize: '11px',
        }}
      >
        <span style={{ color: 'var(--muted)', fontWeight: 700 }}>HOLD ×{items.length}</span>
        <span style={{ color: 'var(--muted)', fontSize: '10px' }}>
          {items.length} consecutive hold decisions — click to {open ? 'collapse' : 'expand'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
          <span style={{ color: 'var(--muted)', fontSize: '9.5px' }}>
            {fmtTime(oldest)}–{fmtTime(newest)}
          </span>
          <span style={{ color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 8px 8px' }}>
          {items.map(item => (
            <div
              key={item.key}
              style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '6px 9px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', fontFamily: 'monospace', fontSize: '10px' }}>
                <span style={{ color: 'var(--muted)', fontWeight: 700 }}>HOLD</span>
                <span style={{ color: 'var(--muted)', marginLeft: 'auto', fontSize: '9px' }}>{fmtTime(item.at)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '10px', lineHeight: 1.5, marginTop: '2px' }}>
                {item.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
