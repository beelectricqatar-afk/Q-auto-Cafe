import type { Ingredient, MenuItem, OrderLine, RecipeLine, Unit } from '../db/schema'

const round3 = (n: number) => Math.round(n * 1000) / 1000

export type SubDivisible = Pick<Ingredient, 'unit' | 'subUnit' | 'subUnitPer'>

/**
 * The unit an ingredient's recipe lines are written in, and how many of them go
 * into one stocked unit. Sub-division only counts when the admin has both named
 * the sub-unit and given a positive conversion, so a half-filled form behaves
 * exactly like an ingredient with no sub-unit at all.
 */
export function subDivision(ing: SubDivisible): { unit: Unit; per: number } {
  return ing.subUnit && ing.subUnitPer && ing.subUnitPer > 0
    ? { unit: ing.subUnit, per: ing.subUnitPer }
    : { unit: ing.unit, per: 1 }
}

/**
 * A sub-unit named with no conversion behind it — a half-filled form that
 * silently measures recipes in whole units instead.
 *
 * This reads the stored conversion rather than `subDivision`'s, because the two
 * disagree on the case that matters: a deliberate 1 (chocolate flakes counted
 * in pieces and served a whole piece at a time) is a complete setup, while
 * `subDivision` reports `per: 1` for that and for a blank field alike.
 */
export function subUnitUnset(ing: SubDivisible): boolean {
  return !!ing.subUnit && !(ing.subUnitPer && ing.subUnitPer > 0)
}

/**
 * Applies `need` (in the ingredient's recipe unit) to its stock.
 *
 * Without sub-division this is a plain subtraction. With it, stock only moves in
 * whole units: a part-used unit is carried in `openSubQty` and drawn from first,
 * so cutting one 10-slice lemon for 4 slices leaves 6 slices open for the next
 * order. Stock may go negative — an order is never blocked.
 */
export function applyDeduction(
  ing: SubDivisible & Pick<Ingredient, 'stockQty' | 'openSubQty'>,
  need: number,
): { stockQty: number; openSubQty: number } {
  const { per } = subDivision(ing)
  const open = ing.openSubQty ?? 0
  if (per === 1) return { stockQty: round3(ing.stockQty - need), openSubQty: open }
  if (need <= open) return { stockQty: ing.stockQty, openSubQty: open - need }
  const short = need - open          // still owed once the open unit is used up
  const cut = Math.ceil(short / per) // whole units that must be broken into
  return { stockQty: round3(ing.stockQty - cut), openSubQty: cut * per - short }
}

/** Drops blank and zero rows, so a half-filled editor row never counts. */
export function tidyRecipe(recipe: RecipeLine[]): RecipeLine[] {
  return recipe.filter(r => r.ingredientId && r.qty > 0)
}

/** Order-independent signature: two recipes with the same lines compare equal. */
export function recipeSignature(recipe: RecipeLine[]): string {
  return tidyRecipe(recipe).map(r => `${r.ingredientId}:${r.qty}`).sort().join('|')
}

export function sameRecipe(a: RecipeLine[], b: RecipeLine[]): boolean {
  return recipeSignature(a) === recipeSignature(b)
}

/** What a line actually consumes: its own recipe if tailored, else the menu's. */
export function recipeFor(line: OrderLine, items: MenuItem[]): RecipeLine[] {
  return line.recipe ?? items.find(i => i.id === line.itemId)?.recipe ?? []
}

/**
 * The exact inverse of `applyDeduction`: puts `amount` back. Sub-units returned
 * to a part-used unit roll up into whole ones, so undoing a 4-slice drink that
 * left 6 slices open restores the lemon rather than leaving 10 slices open.
 */
export function restoreDeduction(
  ing: SubDivisible & Pick<Ingredient, 'stockQty' | 'openSubQty'>,
  amount: number,
): { stockQty: number; openSubQty: number } {
  const { per } = subDivision(ing)
  const open = ing.openSubQty ?? 0
  if (per === 1) return { stockQty: round3(ing.stockQty + amount), openSubQty: open }
  const total = open + amount
  return { stockQty: round3(ing.stockQty + Math.floor(total / per)), openSubQty: total % per }
}

/** Returns a map of ingredientId -> total quantity to deduct for the given order lines. */
export function computeDeductions(lines: OrderLine[], items: MenuItem[]): Record<string, number> {
  const byId = new Map(items.map(i => [i.id, i]))
  const out: Record<string, number> = {}
  for (const line of lines) {
    // A tailored line stands on its own, even if the menu item has since gone.
    const recipe = line.recipe ?? byId.get(line.itemId)?.recipe
    if (!recipe) continue
    for (const r of recipe) {
      out[r.ingredientId] = (out[r.ingredientId] ?? 0) + r.qty * line.qty
    }
  }
  return out
}
