import { describe, it, expect } from 'vitest'
import { milkPair, milkUsed, swapMilk } from './milk'
import type { Ingredient } from '../db/schema'

const ing = (id: string, name: string, unit: Ingredient['unit'] = 'ml'): Ingredient =>
  ({ id, name, unit, stockQty: 1000, lowStockThreshold: 100 })

const fresh = ing('fresh', 'Fresh Milk')
const lactoseFree = ing('lf', 'Lactose Free Milk')
const condensed = ing('cond', 'Condensed Milk', 'g')
const beans = ing('beans', 'Coffee Beans', 'g')
const inventory = [beans, condensed, lactoseFree, fresh]

describe('milkPair', () => {
  it('finds both milks regardless of their order in stock', () => {
    expect(milkPair(inventory)).toEqual({ fresh, lactoseFree })
  })

  it('does not mistake condensed milk for either one', () => {
    expect(milkPair([beans, condensed])).toBeNull()
    expect(milkPair([condensed, fresh])).toBeNull() // no lactose-free option
  })

  it('is null unless the cafe stocks both', () => {
    expect(milkPair([fresh, beans])).toBeNull()
    expect(milkPair([lactoseFree, beans])).toBeNull()
    expect(milkPair([])).toBeNull()
  })
})

describe('milkUsed', () => {
  const pair = { fresh, lactoseFree }

  it('reports the milk a recipe calls for', () => {
    expect(milkUsed([{ ingredientId: 'beans', qty: 18 }, { ingredientId: 'fresh', qty: 180 }], pair)).toBe(fresh)
  })

  it('reports a lactose-free recipe too', () => {
    expect(milkUsed([{ ingredientId: 'lf', qty: 180 }], pair)).toBe(lactoseFree)
  })

  it('is null for a drink with no milk', () => {
    expect(milkUsed([{ ingredientId: 'beans', qty: 18 }], pair)).toBeNull()
  })

  it('is null for a recipe using only condensed milk', () => {
    expect(milkUsed([{ ingredientId: 'cond', qty: 30 }], pair)).toBeNull()
  })
})

describe('swapMilk', () => {
  const recipe = [{ ingredientId: 'beans', qty: 18 }, { ingredientId: 'fresh', qty: 180 }]

  it('swaps the milk and keeps the quantity', () => {
    expect(swapMilk(recipe, 'fresh', 'lf')).toEqual([{ ingredientId: 'beans', qty: 18 }, { ingredientId: 'lf', qty: 180 }])
  })

  it('leaves every other ingredient alone', () => {
    expect(swapMilk(recipe, 'fresh', 'lf')[0]).toEqual(recipe[0])
  })

  it('swaps back the other way', () => {
    const lf = swapMilk(recipe, 'fresh', 'lf')
    expect(swapMilk(lf, 'lf', 'fresh')).toEqual(recipe)
  })

  it('does nothing when the recipe has no such milk', () => {
    expect(swapMilk([{ ingredientId: 'beans', qty: 18 }], 'fresh', 'lf')).toEqual([{ ingredientId: 'beans', qty: 18 }])
  })
})
