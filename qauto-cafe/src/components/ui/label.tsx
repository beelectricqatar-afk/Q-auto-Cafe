import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Label({ className, required, children, ...props }: ComponentProps<'label'> & { required?: boolean }) {
  return (
    <label data-slot="label" className={cn('font-sans text-sm font-medium text-foreground', className)} {...props}>
      {children}
      {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
    </label>
  )
}

/**
 * A label above its field, with an optional hint or error underneath — the one
 * layout every form in the app uses.
 */
export function Field({ label, htmlFor, required, hint, error, className, children }: {
  label: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  /** Says what to enter; shown in place of the hint. */
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div data-slot="field" className={cn('grid min-w-0 gap-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>{label}</Label>
      {children}
      {error
        ? <span role="alert" className="text-xs font-semibold text-destructive">{error}</span>
        : hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}
