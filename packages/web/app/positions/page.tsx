import { tradeRepository } from '@trader/db'
import { PositionsLive } from '@/components/positions-live'

// No revalidate needed — the client component polls independently
export default async function PositionsPage() {
  const openTrades = await tradeRepository.findOpenTrades()

  return (
    <PositionsLive initialPositions={openTrades} />
  )
}
