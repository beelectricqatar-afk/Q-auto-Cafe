import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** A real checkbox, drawn black with a white tick when it is ticked. */
export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "m-0 grid size-[22px] shrink-0 cursor-pointer appearance-none place-items-center rounded-checkbox border-[1.5px] border-border-strong bg-card transition-colors outline-none hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 checked:border-primary checked:bg-primary checked:after:block checked:after:h-[11px] checked:after:w-1.5 checked:after:-translate-y-px checked:after:rotate-45 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-solid checked:after:border-white checked:after:content-[''] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
