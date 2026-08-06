import { describe, it, expect } from 'vitest'
import { applyDeduction, computeDeductions, recipeFor, recipeSignature, sameRecipe, subDivision, tidyRecipe } from './deduction'
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

  it('keeps fractional stock to 3 decimals when not sub-divided', () => {
    expect(applyDeduction({ ...beans, stockQty: 0.3 }, 0.1).stockQty).toBe(0.2)
  })
})
