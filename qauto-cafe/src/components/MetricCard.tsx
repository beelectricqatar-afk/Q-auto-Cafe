import type { ComponentType, CSSProperties } from 'react'
import { cn } from '../lib/utils'

export function MetricCard({ icon: Icon, label, value, tone = 'normal', valueSize = 30, breakdown, style }: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: 'good' | 'bad' | 'normal'
  valueSize?: number
  /** Optional split shown beneath the figure, e.g. departments vs walk-in. */
  breakdown?: { label: string; value: string }[]
  style?: CSSProperties
}) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-foreground'
  return (
    <div className="card-hoverable flex h-full flex-col gap-4 rounded-card bg-card p-6 font-sans shadow-card" style={style}>
      <div className="flex size-10 items-center justify-center rounded-control bg-muted text-foreground">
        <Icon className="metric-card-icon" />
      </div>
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn('font-semibold tabular-nums', color)} style={{ fontSize: valueSize, lineHeight: `${valueSize + 8}px` }}>{value}</div>
        {breakdown && breakdown.length > 0 && (
          <div className="mt-2 grid gap-1.5 text-sm">
            {breakdown.map(b => (
              <div key={b.label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{b.label}</span>
                <strong className={cn('font-semibold whitespace-nowrap', color)}>{b.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
