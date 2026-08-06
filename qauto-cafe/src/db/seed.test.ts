import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from './repo'
import { seedIfEmpty } from './seed'
import type { Category, Ingredient, MenuItem } from './schema'

beforeEach(async () => { await repo.clearAll() })

describe('seedIfEmpty', () => {
  it('loads seed data on first run', async () => {
    await seedIfEmpty()
    expect((await repo.all('departments')).length).toBeGreaterThan(0)
    expect((await repo.all('menuItems')).length).toBeGreaterThan(0)
  })
  it('includes the imported Q Cafe recipe workbook data', async () => {
    await seedIfEmpty()
    const categories = await repo.all<Category>('categories')
    const ingredients = await repo.all<Ingredient>('ingredients')
    const menuItems = await repo.all<MenuItem>('menuItems')
    const cappuccino = menuItems.find(i => i.name === 'Cappuccino')
    expect(categories.map(c => c.name)).toEqual(expect.arrayContaining(['Hot Drinks', 'Iced Drinks', 'Fresh Juices', 'Mojitos', 'Tea']))
    expect(menuItems.filter(i => i.recipe.length > 0).length).toBeGreaterThanOrEqual(34)
    expect(ingredients.some(i => i.name === 'Paper Cup 8 oz' && i.unit === 'pcs')).toBe(true)
    expect(cappuccino?.recipe.length).toBeGreaterThanOrEqual(4)
  })
  it('does not duplicate on second run', async () => {
    await seedIfEmpty()
    const n = (await repo.all('staff')).length
    await seedIfEmpty()
    expect((await repo.all('staff')).length).toBe(n)
  })
})
