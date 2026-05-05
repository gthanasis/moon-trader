import type { Trade } from '@trader/shared'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatUsd, formatPct, formatDuration } from '@/lib/format'

interface TradesTableProps {
  trades: Trade[]
}

export function TradesTable({ trades }: TradesTableProps) {
  if (trades.length === 0) {
    return <p className="text-muted-foreground">No trades yet.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coin</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead>Reasoning</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map(trade => {
          const pnl = trade.pnl ?? 0
          const durationMs =
            trade.closedAt && trade.openedAt
              ? trade.closedAt.getTime() - trade.openedAt.getTime()
              : null

          return (
            <TableRow key={trade.id}>
              <TableCell className="font-medium">
                <Badge variant="outline">{trade.coin}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                  {trade.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatUsd(trade.entryPrice)}</TableCell>
              <TableCell className="text-right">
                {trade.exitPrice != null ? formatUsd(trade.exitPrice) : '—'}
              </TableCell>
              <TableCell className="text-right">
                {trade.pnl != null ? (
                  <span className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatUsd(pnl)}
                  </span>
                ) : '—'}
              </TableCell>
              <TableCell className="text-right">
                {durationMs != null ? formatDuration(durationMs) : '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                {trade.reasoning ?? '—'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
