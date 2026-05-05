import { tradeRepository } from '@trader/db'
import { PositionsLive } from '@/components/positions-live'

// No revalidate needed — the client component polls independently
export default async function PositionsPage() {
  const openTrades = await tradeRepository.findOpenTrades()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Open Positions</h1>
      <PositionsLive initialPositions={openTrades} />
    </div>
  )
}
