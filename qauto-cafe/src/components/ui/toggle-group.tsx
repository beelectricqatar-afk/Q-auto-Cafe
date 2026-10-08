import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface ToggleOption<T extends string> {
  value: T
  label: ReactNode
}

/**
 * One of a few options, picked with a tap. The picked one is always filled
 * black — Cash/Card, L/ml, Month/Days and the dashboard periods all use this,
 * so "selected" looks the same everywhere.
 */
export function ToggleGroup<T extends string>({ value, onChange, options, label, size = 'default', fullWidth, className }: {
  value: T
  onChange: (value: T) => void
  options: ToggleOption<T>[]
  /** Read out for the group as a whole, e.g. "Paid by". */
  label: string
  size?: 'default' | 'sm'
  /** Stretch to the width of its container, the options sharing it equally. */
  fullWidth?: boolean
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="toggle-group"
      className={cn('inline-flex gap-0.5 rounded-control border border-border bg-card p-[3px] font-sans shadow-xs', fullWidth && 'flex w-full', className)}
    >
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-0 cursor-pointer rounded-[7px] border-0 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              size === 'sm' ? 'h-7 min-w-9 px-2' : 'h-8 min-w-14',
              fullWidth && 'flex-1',
              on ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
