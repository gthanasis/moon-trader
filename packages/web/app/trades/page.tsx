'use client'

import { useState } from 'react'
import { TradesTable } from '@/components/trades-table'
import { Button } from '@/components/ui/button'
import { useTrades } from '@/lib/queries'

const PAGE_SIZE = 50

export default function TradesPage() {
  const [page, setPage] = useState(1)
  // Over-fetch up to the current page; the API returns most-recent-first.
  const { data: trades = [], isLoading } = useTrades(PAGE_SIZE * page)

  const pageTrades = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasMore = trades.length === PAGE_SIZE * page

  return (
    <div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <TradesTable trades={pageTrades} />
      )}
      <div className="flex gap-2 mt-4">
        {page > 1 && (
          <Button variant="outline" onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
        )}
        {hasMore && (
          <Button variant="outline" onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
