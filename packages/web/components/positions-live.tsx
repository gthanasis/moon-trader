'use client'

import { useEffect, useState } from 'react'
import type { Trade } from '@trader/shared'
import { PositionsTable } from './positions-table'

interface PositionsLiveProps {
  /** Initial data rendered server-side to avoid layout shift on first load */
  initialPositions: Trade[]
}

export function PositionsLive({ initialPositions }: PositionsLiveProps) {
  const [positions, setPositions] = useState<Trade[]>(initialPositions)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    setLastUpdated(new Date())
    const poll = async () => {
      try {
        const res = await fetch('/api/positions')
        if (res.ok) {
          const data = (await res.json()) as Trade[]
          setPositions(data)
          setLastUpdated(new Date())
        }
      } catch {
        // silently ignore network errors — stale data is acceptable
      }
    }

    const interval = setInterval(() => void poll(), 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()} (refreshes every 30s)` : ''}
      </p>
      <PositionsTable positions={positions} />
    </div>
  )
}
