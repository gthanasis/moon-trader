'use client'

import { usePositions } from '@/lib/queries'
import { PositionsTable } from './positions-table'

/**
 * Open positions, refreshed on an interval via React Query (see usePositions).
 */
export function PositionsLive() {
  const { data: positions = [], dataUpdatedAt, isError } = usePositions()

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        {isError
          ? 'Failed to refresh — showing last known data'
          : dataUpdatedAt
            ? `Last updated: ${new Date(dataUpdatedAt).toLocaleTimeString()} (refreshes every 15s)`
            : 'Loading…'}
      </p>
      <PositionsTable positions={positions} />
    </div>
  )
}
