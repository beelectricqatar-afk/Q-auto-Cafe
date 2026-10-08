import { useId, useState } from 'react'
import type { Ingredient } from '../db/schema'

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
    <div style={{ position: 'relative' }}>
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
        style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 16, background: '#fff', color: 'var(--ink)', width: '100%' }}
      />
      {options.length > 0 && (
        <div id={listId} role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, boxShadow: '0 10px 30px rgba(16,24,40,.12)', overflow: 'hidden' }}>
          {options.map((o, i) => (
            <button
              key={typeof o === 'string' ? 'free' : o.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(o)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: i ? '1px solid #f0f0f0' : 'none', background: i === highlight ? '#F4F5F6' : '#fff', fontSize: 15, color: 'var(--ink)' }}
            >
              {typeof o === 'string'
                ? <><span>Add “{o}” (not a stock item)</span><span style={{ color: 'var(--muted)' }}>{freeNote}</span></>
                : <><span style={{ fontWeight: 600 }}>{o.name}</span><span style={{ color: 'var(--muted)' }}>{o.stockQty} {o.unit} in stock</span></>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
