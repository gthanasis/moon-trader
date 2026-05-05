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
import { formatUsd } from '@/lib/format'

interface PositionsTableProps {
  positions: Trade[]
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return <p className="text-muted-foreground">No open positions.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coin</TableHead>
          <TableHead className="text-right">Entry Price</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead>LLM Reasoning</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map(pos => (
          <TableRow key={pos.id}>
            <TableCell className="font-medium">
              <Badge variant="outline">{pos.coin}</Badge>
            </TableCell>
            <TableCell className="text-right">{formatUsd(pos.entryPrice)}</TableCell>
            <TableCell className="text-right">{formatUsd(pos.size)}</TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
              {pos.reasoning ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
