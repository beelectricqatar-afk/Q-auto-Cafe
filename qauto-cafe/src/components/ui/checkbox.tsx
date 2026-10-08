import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** A real checkbox, drawn black with a white tick when it is ticked. */
export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "m-0 grid size-[18px] shrink-0 cursor-pointer appearance-none place-items-center rounded-checkbox border border-border-strong bg-card shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 checked:border-primary checked:bg-primary checked:after:block checked:after:h-[9px] checked:after:w-[5px] checked:after:-translate-y-px checked:after:rotate-45 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-solid checked:after:border-white checked:after:content-[''] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
