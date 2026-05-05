import { tradeRepository, botStateRepository, signalRepository, decisionRepository } from '@trader/db'
import { StatCard } from '@/components/stat-card'
import { SignalFeed } from '@/components/signal-feed'
import { PositionsTable } from '@/components/positions-table'
import { ApprovalBannerWrapper } from '@/components/approval-banner-wrapper'
import { formatUsd } from '@/lib/format'

export const revalidate = 30

export default async function OverviewPage() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [recentTrades, openTrades, fearAndGreed, signals, pendingDecision] = await Promise.all([
    tradeRepository.findRecentTrades(100),
    tradeRepository.findOpenTrades(),
    botStateRepository.get('fearAndGreed') as Promise<number | null>,
    signalRepository.findSignalsSince(since),
    decisionRepository.findPendingDecision(),
  ])

  const totalPnl = recentTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const capitalDeployed = openTrades.reduce((sum, t) => sum + t.size, 0)
  const pnlVariant = totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : 'neutral'
  const fgScore = fearAndGreed ?? null
  const fgVariant = fgScore == null ? 'neutral' : fgScore < 30 ? 'neg' : fgScore < 60 ? 'warn' : 'pos'

  return (
    <div>
      {/* 4-col stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard
          label="Total P&L"
          value={formatUsd(totalPnl)}
          sub={totalPnl >= 0 ? '+since inception' : 'since inception'}
          colorVariant={pnlVariant}
        />
        <StatCard
          label="Capital Deployed"
          labelSimple="Money in the Market"
          value={formatUsd(capitalDeployed)}
          sub="sum of open Trade.size"
          subSimple="currently tied up in trades"
        />
        <StatCard
          label="Open Positions"
          value={String(openTrades.length)}
          sub="active trades"
        />
        <StatCard
          label="Fear & Greed"
          labelSimple="Market Mood Score"
          value={fgScore != null ? String(fgScore) : '—'}
          sub={fgScore != null ? `${fgScore < 30 ? 'Fear' : fgScore < 60 ? 'Neutral' : 'Greed'} · index` : '—'}
          subSimple={fgScore != null ? `${fgScore < 30 ? 'Fearful' : fgScore < 60 ? 'Neutral (50 = calm)' : 'Greedy'} · improving` : '—'}
          colorVariant={fgVariant}
        />
      </div>

      {/* approval banner — only shown when a pending decision exists */}
      {pendingDecision && <ApprovalBannerWrapper decision={pendingDecision} />}

      {/* 2-col layout: 1.6fr positions | 1fr signals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '16px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '10px' }}>Open Positions</div>
          <PositionsTable positions={openTrades} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '10px' }}>Recent Signals</div>
          <SignalFeed signals={signals.slice(0, 20)} />
        </div>
      </div>
    </div>
  )
}
