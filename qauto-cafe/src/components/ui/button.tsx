import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

// The app sets a min-height on every button for tapping; the size variants set
// the height themselves, so it is cleared here.
const buttonVariants = cva(
  'inline-flex min-h-0 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent font-sans text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The one main action on a card or screen. */
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-muted text-foreground hover:bg-muted-hover',
        outline: 'border-border bg-card text-foreground hover:bg-muted',
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        /** Only for confirming something that cannot be taken back. */
        destructive: 'bg-destructive text-white hover:bg-destructive-hover',
        link: 'h-auto bg-transparent p-0 text-muted-foreground underline underline-offset-4 hover:text-foreground',
      },
      size: {
        default: 'h-control px-5',
        sm: 'h-control-sm px-3.5',
        lg: 'h-14 w-full px-6 text-base',
        icon: 'size-control-sm p-0',
      },
    },
    compoundVariants: [
      // An icon button carries an outline so it reads as a button on a card.
      { size: 'icon', variant: 'outline', className: 'bg-card' },
      { variant: 'link', className: 'h-auto px-0' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { buttonVariants }
