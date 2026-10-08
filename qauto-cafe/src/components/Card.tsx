import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * A card in the Calm look: white, no border, rounded, set apart from the toned
 * page by its colour. Clips to its corners unless `style` says otherwise — a
 * suggestion list hanging out of it needs `overflow: 'visible'`.
 */
export function Card({ title, actions, padding = 28, style, hoverable = false, children }: {
  title?: ReactNode
  actions?: ReactNode
  padding?: number
  style?: CSSProperties
  hoverable?: boolean
  children?: ReactNode
}) {
  return (
    <div className={cn('rounded-card bg-card font-sans text-foreground shadow-card', hoverable && 'card-hoverable')} style={{ overflow: 'hidden', ...style }}>
      {title && (
        <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-7', children != null ? 'pt-6 pb-2' : 'py-6')}>
          <h3 className="m-0 text-lg font-medium text-foreground">{title}</h3>
          {actions}
        </div>
      )}
      {children != null && <div style={{ padding, paddingTop: title && padding ? Math.min(padding, 16) : padding }}>{children}</div>}
    </div>
  )
}
