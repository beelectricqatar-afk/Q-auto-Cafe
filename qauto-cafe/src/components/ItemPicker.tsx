import { useId, useState } from 'react'
import type { Ingredient } from '../db/schema'
import { cn } from '../lib/utils'
import { fieldClass } from './ui/input'

/**
 * Picks an item from the inventory, or names something that is not stocked
 * (gloves, a delivery charge) so it can still go on the list.
 */
export function ItemPicker({ ingredients, onPick, label = 'Add an item from the receipt', placeholder = 'Add an item from the receipt, e.g. milk', freeNote = 'expense only' }: {
  ingredients: Ingredient[]
  onPick: (pick: Ingredient | string) => void
  label?: string
  placeholder?: string
  /** Said beside the option for something not in the inventory. */
  freeNote?: string
}) {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listId = useId()
  const q = query.trim().toLowerCase()
  const matches = q ? ingredients.filter(i => i.name.toLowerCase().includes(q)).slice(0, 6) : []
  const options: (Ingredient | string)[] = q ? [...matches, query.trim()] : []
  const pick = (o: Ingredient | string) => { onPick(o); setQuery(''); setHighlight(0) }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setHighlight(0) }}
        onKeyDown={e => {
          if (!options.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % options.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + options.length) % options.length) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(options[highlight]) }
          else if (e.key === 'Escape') setQuery('')
        }}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        className={fieldClass}
      />
      {options.length > 0 && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-30 grid gap-0.5 rounded-control border border-border bg-card p-1 font-sans shadow-pop">
          {options.map((o, i) => (
            <button
              key={typeof o === 'string' ? 'free' : o.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(o)}
              className={cn('flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] border-0 px-3 text-left text-sm text-foreground', i === highlight ? 'bg-muted' : 'bg-transparent hover:bg-muted')}
            >
              {typeof o === 'string'
                ? <><span>Add “{o}” (not a stock item)</span><span className="text-xs text-muted-foreground">{freeNote}</span></>
                : <><span className="font-medium">{o.name}</span><span className="text-xs text-muted-foreground">{o.stockQty} {o.unit} in stock</span></>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
