import type { Ingredient, RecipeLine } from '../db/schema'

// A drink made with milk can be served with either of the two the cafe stocks.
// The match is deliberately narrow: "Condensed Milk" is an ingredient in its own
// right, not an alternative anyone would swap in.
const FRESH = /fresh\s*milk/i
const LACTOSE_FREE = /lactose/i

export interface MilkPair { fresh: Ingredient; lactoseFree: Ingredient }

/** The pair a barista can choose between, or null if stock lacks either one. */
export function milkPair(ingredients: Ingredient[]): MilkPair | null {
  const fresh = ingredients.find(i => FRESH.test(i.name))
  const lactoseFree = ingredients.find(i => LACTOSE_FREE.test(i.name))
  return fresh && lactoseFree ? { fresh, lactoseFree } : null
}

/** Which of the two a recipe calls for, or null when it is not a milk drink. */
export function milkUsed(recipe: RecipeLine[], pair: MilkPair): Ingredient | null {
  for (const line of recipe) {
    if (line.ingredientId === pair.fresh.id) return pair.fresh
    if (line.ingredientId === pair.lactoseFree.id) return pair.lactoseFree
  }
  return null
}

/** The same recipe with one milk swapped for the other, quantity untouched. */
export function swapMilk(recipe: RecipeLine[], fromId: string, toId: string): RecipeLine[] {
  return recipe.map(line => line.ingredientId === fromId ? { ...line, ingredientId: toId } : line)
}
