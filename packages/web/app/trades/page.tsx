import { tradeRepository } from '@trader/db'
import { TradesTable } from '@/components/trades-table'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const revalidate = 60

const PAGE_SIZE = 50

interface TradesPageProps {
  searchParams: { page?: string }
}

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const page = Math.max(1, Number(searchParams.page ?? '1'))
  const limit = PAGE_SIZE * page
  const trades = await tradeRepository.findRecentTrades(limit)
  const pageTrades = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasMore = trades.length === limit

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Trade History</h1>
      <TradesTable trades={pageTrades} />
      <div className="flex gap-2 mt-4">
        {page > 1 && (
          <Button variant="outline" asChild>
            <Link href={`/trades?page=${page - 1}`}>Previous</Link>
          </Button>
        )}
        {hasMore && (
          <Button variant="outline" asChild>
            <Link href={`/trades?page=${page + 1}`}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
