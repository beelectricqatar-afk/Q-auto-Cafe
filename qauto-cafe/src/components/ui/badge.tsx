import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

/** A short status word. The colour says how it reads: fine, needs attention, a problem. */
const badgeVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2.5 font-sans text-xs font-semibold',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-foreground',
        outline: 'border-border bg-card text-muted-foreground',
        solid: 'bg-primary text-primary-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { badgeVariants }
