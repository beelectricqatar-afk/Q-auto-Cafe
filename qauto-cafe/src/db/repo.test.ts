import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from './repo'

beforeEach(async () => { await repo.clearAll() })

describe('repo', () => {
  it('puts and gets a record', async () => {
    await repo.put('ingredients', { id: 'a', name: 'Milk', unit: 'ml', stockQty: 1000, lowStockThreshold: 200 })
    const got = await repo.get('ingredients', 'a')
    expect(got?.name).toBe('Milk')
  })
  it('lists all records', async () => {
    await repo.put('categories', { id: 'c1', name: 'Hot Drinks', sortOrder: 1 })
    await repo.put('categories', { id: 'c2', name: 'Tea', sortOrder: 2 })
    expect((await repo.all('categories')).length).toBe(2)
  })
  it('deletes a record', async () => {
    await repo.put('categories', { id: 'c1', name: 'X', sortOrder: 1 })
    await repo.remove('categories', 'c1')
    expect(await repo.get('categories', 'c1')).toBeUndefined()
  })
})
