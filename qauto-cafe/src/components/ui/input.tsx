import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Shared look of every typed-in field: outline, height, focus ring, error state. */
export const fieldClass =
  'block h-control w-full min-w-0 rounded-control border border-border bg-card px-3 font-sans text-base text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-placeholder hover:border-border-strong focus:border-ring focus:shadow-[0_0_0_3px_rgba(20,20,20,0.08)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_rgba(229,72,77,0.12)]'

export interface InputProps extends ComponentProps<'input'> {
  /** A unit shown inside the field on the right, e.g. "QAR" or "pcs". */
  suffix?: ReactNode
}

export function Input({ className, suffix, ...props }: InputProps) {
  const input = <input data-slot="input" className={cn(fieldClass, suffix != null && 'pr-14', className)} {...props} />
  if (suffix == null) return input
  return (
    <div className="relative min-w-0">
      {input}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-muted-foreground">{suffix}</span>
    </div>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldClass, 'h-auto min-h-24 resize-y py-2.5', className)} {...props} />
}

/** A native select — on a tablet it opens the system picker, which is easier to tap. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        fieldClass,
        "cursor-pointer appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236B6B6B' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:16px] bg-[position:right_12px_center] bg-no-repeat pr-10",
        className,
      )}
      {...props}
    />
  )
}
