'use client'

import { usePositions, useTrades } from '@/lib/queries'
import { formatUsd } from '@/lib/format'

function isToday(iso: string | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return d.getUTCFullYear() === now.getUTCFullYear()
    && d.getUTCMonth() === now.getUTCMonth()
    && d.getUTCDate() === now.getUTCDate()
}

/** The primary P&L banner — the first thing a watcher should see. */
export function PnlHero() {
  const { data: trades = [] } = useTrades(200)
  const { data: open = [] } = usePositions()

  const totalPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const todayPnl = trades
    .filter(t => isToday(t.closedAt as unknown as string))
    .reduce((s, t) => s + (t.pnl ?? 0), 0)
  const deployed = open.reduce((s, t) => s + t.size, 0)

  const tone = (n: number) => (n > 0 ? 'var(--pos)' : n < 0 ? 'var(--neg)' : 'var(--fg)')

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
        gap: '1px',
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        overflow: 'hidden',
      }}
    >
      <HeroCell label="Total P&L" value={formatUsd(totalPnl)} color={tone(totalPnl)} big />
      <HeroCell label="Today's P&L" value={formatUsd(todayPnl)} color={tone(todayPnl)} />
      <HeroCell label="Capital Deployed" value={formatUsd(deployed)} color="var(--fg)" />
      <HeroCell label="Open Positions" value={String(open.length)} color="var(--fg)" />
    </div>
  )
}

function HeroCell({
  label, value, color, big = false,
}: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', padding: big ? '20px 22px' : '20px 18px' }}>
      <div
        style={{
          fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'monospace', fontWeight: 700, color,
          fontVariantNumeric: 'tabular-nums',
          fontSize: big ? '40px' : '22px', lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}
