import type { Ingredient, RecipeLine } from '../db/schema'
import { subDivision } from '../domain/deduction'
import { Button } from './ui/button'
import { Input, Select } from './ui/input'

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
    <div className="grid gap-2 font-sans">
      {recipe.length === 0 && (
        <div className="text-sm text-muted-foreground">No ingredients — nothing will be deducted from stock.</div>
      )}
      {recipe.map((r, idx) => {
        // A sub-divided ingredient is measured in its sub-unit here (4 lemon
        // slices, not 4 lemons) — label the box so that isn't a guess.
        const ing = ingredients.find(i => i.id === r.ingredientId)
        const qtyUnit = ing ? subDivision(ing).unit : ''
        return (
          <div key={idx} className="flex items-center gap-2">
            <Select
              value={r.ingredientId}
              onChange={e => setRow(idx, { ingredientId: e.target.value })}
              aria-label={`Ingredient ${idx + 1}`}
              className="flex-1"
            >
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({subDivision(i).unit})</option>)}
            </Select>
            <Input
              type="number"
              value={r.qty}
              onChange={e => setRow(idx, { qty: Number(e.target.value) })}
              aria-label={`Quantity ${idx + 1}`}
              className="w-24"
            />
            <span className="w-13 text-xs text-muted-foreground">{qtyUnit}</span>
            <button
              onClick={() => onChange(recipe.filter((_, i) => i !== idx))}
              aria-label={`Remove ingredient ${idx + 1}`}
              className="icon-btn danger"
            >
              ×
            </button>
          </div>
        )
      })}
      <Button variant="outline" onClick={() => onChange([...recipe, { ingredientId: ingredients[0]?.id ?? '', qty: 0 }])}>
        + Add ingredient
      </Button>
    </div>
  )
}
