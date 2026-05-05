import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StatCardProps {
  label: string
  value: string
  /** Optional color hint: 'positive' | 'negative' | 'neutral' */
  variant?: 'positive' | 'negative' | 'neutral'
}

export function StatCard({ label, value, variant = 'neutral' }: StatCardProps) {
  const valueClass =
    variant === 'positive'
      ? 'text-green-600'
      : variant === 'negative'
      ? 'text-red-600'
      : 'text-foreground'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
