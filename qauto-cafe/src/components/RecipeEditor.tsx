import type { Ingredient, RecipeLine } from '../db/schema'
import { subDivision } from '../domain/deduction'

// The ingredient rows shared by the admin recipe modal and the barista's
// per-order tailoring, so both show the same thing. The confirm button belongs
// to the caller, whose wording differs.
export function RecipeEditor({ ingredients, recipe, onChange }: {
  ingredients: Ingredient[]
  recipe: RecipeLine[]
  onChange: (recipe: RecipeLine[]) => void
}) {
  const setRow = (idx: number, patch: Partial<RecipeLine>) =>
    onChange(recipe.map((r, i) => i === idx ? { ...r, ...patch } : r))

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {recipe.length === 0 && (
        <div style={{ color: 'var(--muted)' }}>No ingredients — nothing will be deducted from stock.</div>
      )}
      {recipe.map((r, idx) => {
        // A sub-divided ingredient is measured in its sub-unit here (4 lemon
        // slices, not 4 lemons) — label the box so that isn't a guess.
        const ing = ingredients.find(i => i.id === r.ingredientId)
        const qtyUnit = ing ? subDivision(ing).unit : ''
        return (
          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={r.ingredientId}
              onChange={e => setRow(idx, { ingredientId: e.target.value })}
              aria-label={`Ingredient ${idx + 1}`}
              style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }}
            >
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({subDivision(i).unit})</option>)}
            </select>
            <input
              type="number"
              value={r.qty}
              onChange={e => setRow(idx, { qty: Number(e.target.value) })}
              aria-label={`Quantity ${idx + 1}`}
              style={{ width: 90, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }}
            />
            <span style={{ width: 52, color: 'var(--muted)', fontSize: 13 }}>{qtyUnit}</span>
            <button
              onClick={() => onChange(recipe.filter((_, i) => i !== idx))}
              aria-label={`Remove ingredient ${idx + 1}`}
              style={{ border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 8, padding: '6px 10px', background: '#fff' }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        onClick={() => onChange([...recipe, { ingredientId: ingredients[0]?.id ?? '', qty: 0 }])}
        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, background: '#fff' }}
      >
        + Add ingredient
      </button>
    </div>
  )
}
