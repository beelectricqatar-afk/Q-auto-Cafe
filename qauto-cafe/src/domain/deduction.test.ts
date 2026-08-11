import { describe, it, expect } from 'vitest'
import { applyDeduction, computeDeductions, recipeFor, recipeSignature, restoreDeduction, sameRecipe, subDivision, subUnitUnset, tidyRecipe } from './deduction'
import type { Ingredient, MenuItem, OrderLine } from '../db/schema'

const items: MenuItem[] = [
  { id: 'latte', name: 'Latte', categoryId: 'h', price: 10, active: true, recipe: [ { ingredientId: 'milk', qty: 250 }, { ingredientId: 'beans', qty: 18 } ] },
  { id: 'water', name: 'Water', categoryId: 's', price: 3, active: true, recipe: [] },
]

describe('computeDeductions', () => {
  it('multiplies recipe qty by line qty and sums per ingredient', () => {
    const lines: OrderLine[] = [ { itemId: 'latte', name: 'Latte', qty: 2, unitPrice: 10 } ]
    const d = computeDeductions(lines, items)
    expect(d).toEqual({ milk: 500, beans: 36 })
  })
  it('ignores items with no recipe', () => {
    const lines: OrderLine[] = [ { itemId: 'water', name: 'Water', qty: 1, unitPrice: 3 } ]
    expect(computeDeductions(lines, items)).toEqual({})
  })
  it('aggregates a shared ingredient across multiple items', () => {
    const more: MenuItem[] = [ ...items, { id: 'cap', name: 'Cappuccino', categoryId: 'h', price: 10, active: true, recipe: [ { ingredientId: 'milk', qty: 150 } ] } ]
    const lines: OrderLine[] = [ { itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10 }, { itemId: 'cap', name: 'Cappuccino', qty: 1, unitPrice: 10 } ]
    expect(computeDeductions(lines, more).milk).toBe(400)
  })

  it('uses a line\'s own recipe when the barista tailored it', () => {
    const lines: OrderLine[] = [
      { itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10, recipe: [{ ingredientId: 'milk', qty: 400 }, { ingredientId: 'syrup', qty: 20 }] },
    ]
    expect(computeDeductions(lines, items)).toEqual({ milk: 400, syrup: 20 })
  })

  it('leaves other lines of the same item on the menu recipe', () => {
    const lines: OrderLine[] = [
      { itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10 },
      { itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10, recipe: [{ ingredientId: 'milk', qty: 400 }] },
    ]
    expect(computeDeductions(lines, items)).toEqual({ milk: 650, beans: 18 }) // 250 + 400
  })

  it('scales a tailored recipe by the line quantity', () => {
    const lines: OrderLine[] = [{ itemId: 'latte', name: 'Latte', qty: 3, unitPrice: 10, recipe: [{ ingredientId: 'milk', qty: 100 }] }]
    expect(computeDeductions(lines, items)).toEqual({ milk: 300 })
  })

  it('honours a tailored line even if the menu item was since deleted', () => {
    const lines: OrderLine[] = [{ itemId: 'gone', name: 'Special', qty: 1, unitPrice: 10, recipe: [{ ingredientId: 'milk', qty: 50 }] }]
    expect(computeDeductions(lines, items)).toEqual({ milk: 50 })
  })

  it('deducts nothing for a line emptied of ingredients', () => {
    const lines: OrderLine[] = [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10, recipe: [] }]
    expect(computeDeductions(lines, items)).toEqual({})
  })
})

describe('recipe helpers', () => {
  const recipe = [{ ingredientId: 'milk', qty: 250 }, { ingredientId: 'beans', qty: 18 }]

  it('drops blank and zero rows', () => {
    expect(tidyRecipe([...recipe, { ingredientId: '', qty: 5 }, { ingredientId: 'syrup', qty: 0 }])).toEqual(recipe)
  })

  it('compares recipes regardless of row order', () => {
    expect(sameRecipe(recipe, [recipe[1], recipe[0]])).toBe(true)
  })

  it('notices a changed quantity', () => {
    expect(sameRecipe(recipe, [{ ingredientId: 'milk', qty: 400 }, recipe[1]])).toBe(false)
  })

  it('treats a padding row as no change', () => {
    expect(sameRecipe(recipe, [...recipe, { ingredientId: 'syrup', qty: 0 }])).toBe(true)
  })

  it('signs an empty recipe distinctly from a filled one', () => {
    expect(recipeSignature([])).toBe('')
    expect(recipeSignature(recipe)).not.toBe('')
  })

  it('falls back to the menu recipe when a line has none', () => {
    expect(recipeFor({ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10 }, items)).toEqual(items[0].recipe)
  })

  it('returns the line recipe when present', () => {
    const own = [{ ingredientId: 'milk', qty: 1 }]
    expect(recipeFor({ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10, recipe: own }, items)).toBe(own)
  })
})

// 1 lemon = 10 slices, 40 lemons in stock.
const lemon: Ingredient = {
  id: 'lemon', name: 'Lemon', unit: 'pcs', stockQty: 40, lowStockThreshold: 10,
  subUnit: 'slices', subUnitPer: 10, openSubQty: 0,
}
const beans: Ingredient = { id: 'beans', name: 'Coffee Beans', unit: 'g', stockQty: 2000, lowStockThreshold: 300 }

describe('subDivision', () => {
  it('reports the sub-unit and conversion when fully configured', () => {
    expect(subDivision(lemon)).toEqual({ unit: 'slices', per: 10 })
  })
  it('falls back to the stocked unit when no sub-unit is set', () => {
    expect(subDivision(beans)).toEqual({ unit: 'g', per: 1 })
  })
  it('ignores a half-filled configuration', () => {
    // A blank number field saves as 0 via CrudList, and a named sub-unit with no
    // conversion is meaningless — both must read as "not sub-divided".
    expect(subDivision({ ...lemon, subUnitPer: 0 })).toEqual({ unit: 'pcs', per: 1 })
    expect(subDivision({ ...lemon, subUnit: undefined })).toEqual({ unit: 'pcs', per: 1 })
  })
})

// Chocolate flakes: counted in pieces, and one whole piece is served per order.
// The conversion really is 1, which must not be mistaken for an unfilled field.
const flakes: Ingredient = {
  id: 'flakes', name: 'Chocolate Flakes', unit: 'pcs', subUnit: 'pc', subUnitPer: 1,
  stockQty: 40, lowStockThreshold: 12,
}

describe('a sub-unit conversion of 1', () => {
  it('is reported as configured, in the sub-unit', () => {
    expect(subDivision(flakes)).toEqual({ unit: 'pc', per: 1 })
  })

  it('does not read as a half-filled form', () => {
    expect(subUnitUnset(flakes)).toBe(false)
  })

  // The bug this fixes: at 2 per piece, one flake per order took stock down by
  // a whole piece only every second order.
  it('takes one whole piece off stock per serving', () => {
    expect(applyDeduction(flakes, 1)).toEqual({ stockQty: 39, openSubQty: 0 })
    expect(applyDeduction({ ...flakes, subUnitPer: 2 }, 1)).toEqual({ stockQty: 39, openSubQty: 1 })
  })

  it('never leaves a part-used piece open', () => {
    expect(applyDeduction(flakes, 3).openSubQty).toBe(0)
    expect(restoreDeduction(flakes, 3)).toEqual({ stockQty: 43, openSubQty: 0 })
  })
})

describe('subUnitUnset', () => {
  it('is true for a sub-unit named with no conversion behind it', () => {
    expect(subUnitUnset({ ...lemon, subUnitPer: 0 })).toBe(true)
    expect(subUnitUnset({ ...lemon, subUnitPer: undefined })).toBe(true)
  })
  it('is false when no sub-unit was named at all', () => {
    expect(subUnitUnset(beans)).toBe(false)
    expect(subUnitUnset({ ...lemon, subUnit: undefined })).toBe(false)
  })
  it('is false for a real conversion', () => {
    expect(subUnitUnset(lemon)).toBe(false)
    expect(subUnitUnset(flakes)).toBe(false)
  })
})

describe('applyDeduction', () => {
  it('cuts a whole lemon and carries the rest of its slices', () => {
    expect(applyDeduction(lemon, 4)).toEqual({ stockQty: 39, openSubQty: 6 })
  })

  it('serves later orders from the opened lemon before cutting another', () => {
    // Three 4-slice mojitos in a row.
    let state = { ...lemon }
    const seen = [0, 0, 0].map(() => {
      state = { ...state, ...applyDeduction(state, 4) }
      return [state.stockQty, state.openSubQty]
    })
    expect(seen).toEqual([[39, 6], [39, 2], [38, 8]])
  })

  it('consumes exactly one lemon per 10 slices over many orders', () => {
    let state = { ...lemon }
    for (let i = 0; i < 25; i++) state = { ...state, ...applyDeduction(state, 4) }
    expect(state).toMatchObject({ stockQty: 30, openSubQty: 0 }) // 100 slices, no drift
  })

  it('takes the exact open remainder without cutting a new one', () => {
    expect(applyDeduction({ ...lemon, openSubQty: 10 }, 10)).toEqual({ stockQty: 40, openSubQty: 0 })
  })

  it('cuts several lemons for an order larger than one', () => {
    expect(applyDeduction(lemon, 25)).toEqual({ stockQty: 37, openSubQty: 5 })
  })

  it('goes negative rather than blocking an order', () => {
    expect(applyDeduction({ ...lemon, stockQty: 0 }, 4)).toEqual({ stockQty: -1, openSubQty: 6 })
  })

  it('subtracts directly for an ingredient with no sub-unit', () => {
    expect(applyDeduction(beans, 18)).toEqual({ stockQty: 1982, openSubQty: 0 })
  })

  it('is exactly undone by restoreDeduction', () => {
    // Whatever state a deduction leaves, putting the same amount back must
    // return the ingredient to where it started — this is what makes deleting
    // an order and restocking it safe.
    for (const need of [1, 4, 9, 10, 11, 25, 40]) {
      for (const openSubQty of [0, 3, 6, 9]) {
        const start = { ...lemon, openSubQty }
        const after = { ...start, ...applyDeduction(start, need) }
        const back = restoreDeduction(after, need)
        expect(back, `need=${need} open=${openSubQty}`).toEqual({ stockQty: start.stockQty, openSubQty })
      }
    }
  })

  it('keeps fractional stock to 3 decimals when not sub-divided', () => {
    expect(applyDeduction({ ...beans, stockQty: 0.3 }, 0.1).stockQty).toBe(0.2)
  })
})

describe('restoreDeduction', () => {
  it('rolls returned slices back up into whole lemons', () => {
    // 39 lemons with 6 slices open; returning 4 completes the tenth slice.
    expect(restoreDeduction({ ...lemon, stockQty: 39, openSubQty: 6 }, 4)).toEqual({ stockQty: 40, openSubQty: 0 })
  })

  it('returns part of a unit without completing it', () => {
    expect(restoreDeduction({ ...lemon, stockQty: 39, openSubQty: 2 }, 3)).toEqual({ stockQty: 39, openSubQty: 5 })
  })

  it('returns several whole units at once', () => {
    expect(restoreDeduction({ ...lemon, stockQty: 37, openSubQty: 5 }, 25)).toEqual({ stockQty: 40, openSubQty: 0 })
  })

  it('adds straight back for an ingredient with no sub-unit', () => {
    expect(restoreDeduction(beans, 18)).toEqual({ stockQty: 2018, openSubQty: 0 })
  })

  it('lifts negative stock back out of the red', () => {
    expect(restoreDeduction({ ...lemon, stockQty: -1, openSubQty: 6 }, 4)).toEqual({ stockQty: 0, openSubQty: 0 })
  })
})
