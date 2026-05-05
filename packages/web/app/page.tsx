import { tradeRepository, botStateRepository } from '@trader/db'
import { StatCard } from '@/components/stat-card'
import { formatUsd } from '@/lib/format'

export const revalidate = 30

export default async function OverviewPage() {
  const [recentTrades, openTrades, fearAndGreed] = await Promise.all([
    tradeRepository.findRecentTrades(100),
    tradeRepository.findOpenTrades(),
    botStateRepository.get('fearAndGreed') as Promise<number | null>,
  ])

  const totalPnl = recentTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const capitalDeployed = openTrades.reduce((sum, t) => sum + t.size, 0)
  const pnlVariant = totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : 'neutral'
  const fgScore = fearAndGreed ?? null
  const fgVariant = fgScore == null ? 'neutral' : fgScore < 30 ? 'neg' : fgScore < 60 ? 'warn' : 'pos'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
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
    </div>
  )
}
