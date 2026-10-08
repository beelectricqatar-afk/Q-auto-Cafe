import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** White, no border, rounded — set apart from the toned page by its colour alone. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('min-w-0 rounded-card bg-card font-sans text-foreground shadow-card', className)} {...props} />
}

/** Title on the left, an action on the right. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex items-center justify-between gap-3 px-6 pt-6', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('m-0 text-base leading-snug font-medium text-foreground', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('m-0 text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('grid gap-4 px-6 pt-4 pb-6', className)} {...props} />
}

/** One line of a list inside a card, divided from the next by a faint rule. */
export function CardRow({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-row" className={cn('flex items-center justify-between gap-3 border-b border-divider px-6 py-3 last:border-b-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center justify-between gap-3 rounded-b-card border-t border-divider bg-footer px-6 py-4', className)} {...props} />
}
