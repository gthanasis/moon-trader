'use client'

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

/** Real-time bot activity: last-N decisions on mount, live SSE events on top. */
export function LiveActivityFeed() {
  const { data: decisions = [] } = useDecisions(20)
  const events = useLiveEvents()

  const items: FeedItem[] = [
    ...events.map(eventToItem),
    ...decisions.map(decisionToItem),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 30)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '10px' }}>Live Activity</div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '11px' }}>Waiting for the bot to act…</p>
        )}
        {items.map(item => (
          <div
            key={item.key}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${item.tone}`, borderRadius: 'var(--r)', padding: '7px 10px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', fontFamily: 'monospace', fontSize: '11px' }}>
              <span style={{ color: item.tone, fontWeight: 700, flexShrink: 0 }}>{item.label}</span>
              <span style={{ color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0, fontSize: '9.5px' }}>
                {new Date(item.at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '10.5px', lineHeight: 1.5, marginTop: '2px' }}>
              {item.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
