import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from './repo'
import { seedIfEmpty, seedPriceList } from './seed'
import { PRICE_LIST } from '../domain/priceList'
import type { PriceListItem } from './schema'
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

describe('seedPriceList', () => {
  const stored = () => repo.all<PriceListItem>('priceList')

  it('puts the whole sheet on a fresh device', async () => {
    expect(await seedPriceList()).toBe(PRICE_LIST.length)
    expect(await stored()).toHaveLength(PRICE_LIST.length)
  })

  it('does nothing on a second pass', async () => {
    await seedPriceList()
    expect(await seedPriceList()).toBe(0)
  })

  // The case that matters when a price changes: an add-only seed would leave
  // every existing device on the old figure forever.
  it('overwrites a stored row whose price has since changed', async () => {
    const water = PRICE_LIST.find(p => p.id === 'sparkling-water')!
    await repo.putMany('priceList', [{ ...water, priceQar: 999, packQty: 250, packUom: 'mL' }])

    expect(await seedPriceList()).toBeGreaterThan(0)
    const after = (await stored()).find(p => p.id === 'sparkling-water')!
    expect(after).toMatchObject({ priceQar: 3, packQty: 1, packUom: 'bottle' })
  })

  it('deletes a row that has been withdrawn from the sheet', async () => {
    await seedPriceList()
    await repo.putMany('priceList', [{ id: 'gone', name: 'Withdrawn', priceQar: 1, packQty: 1, packUom: 'each', match: ['Withdrawn'] }])

    expect(await seedPriceList()).toBe(1)
    expect((await stored()).some(p => p.id === 'gone')).toBe(false)
  })
})
