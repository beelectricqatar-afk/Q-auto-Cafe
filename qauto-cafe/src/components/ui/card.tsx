import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** White, no border, rounded — set apart from the toned page by its colour alone. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('min-w-0 rounded-card bg-card font-sans text-foreground shadow-card', className)} {...props} />
}

/** Title on the left, an action on the right. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex items-center justify-between gap-3 px-7 pt-6 pb-2', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('m-0 text-lg font-medium text-foreground', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('m-0 text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('grid gap-4 px-7 pt-4 pb-7', className)} {...props} />
}

/** One line of a list inside a card, divided from the next by a faint rule. */
export function CardRow({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-row" className={cn('flex items-center justify-between gap-3 border-b border-divider px-7 py-4 last:border-b-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center justify-between gap-3 border-t border-divider px-7 py-5', className)} {...props} />
}
