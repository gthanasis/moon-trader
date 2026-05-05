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

  const pnlVariant = totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : 'neutral'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total P&L"
          value={formatUsd(totalPnl)}
          variant={pnlVariant}
        />
        <StatCard
          label="Capital Deployed"
          value={formatUsd(capitalDeployed)}
        />
        <StatCard
          label="Open Positions"
          value={String(openTrades.length)}
        />
        <StatCard
          label="Fear & Greed"
          value={fearAndGreed != null ? String(fearAndGreed) : '—'}
        />
      </div>
    </div>
  )
}
