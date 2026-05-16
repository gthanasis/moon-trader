'use client'

import { PnlHero } from '@/components/dashboard/pnl-hero'
import { NarrationPanel } from '@/components/dashboard/narration-panel'
import { LiveActivityFeed } from '@/components/dashboard/live-activity-feed'
import { SignalsSummary } from '@/components/dashboard/signals-summary'
import { ApprovalBannerWrapper } from '@/components/approval-banner-wrapper'
import { usePendingDecision } from '@/lib/queries'
import { useAppEvents } from '@/lib/use-app-events'

/**
 * Single-screen real-time dashboard:
 *   P&L hero  ·  narration | live activity  ·  signals summary
 */
export default function OverviewPage() {
  // Opens the one SSE connection that feeds live updates into the cache.
  useAppEvents()
  const { data: pendingDecision = null } = usePendingDecision()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%', minHeight: 0 }}>
      <PnlHero />

      {pendingDecision && <ApprovalBannerWrapper decision={pendingDecision} />}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr',
          gap: '14px',
        }}
      >
        <Panel>
          <NarrationPanel />
        </Panel>
        <Panel>
          <LiveActivityFeed />
        </Panel>
      </div>

      <SignalsSummary />
    </div>
  )
}

/** A bordered region whose content scrolls internally so the page never does. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: 0,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        background: 'var(--bg)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  )
}
