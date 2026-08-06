import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from './repo'
import { exportAll, importAll } from './backup'

beforeEach(async () => { await repo.clearAll() })

describe('backup', () => {
  it('round-trips all stores', async () => {
    await repo.put('ingredients', { id: 'm', name: 'Milk', unit: 'ml', stockQty: 500, lowStockThreshold: 100 })
    await repo.put('categories', { id: 'c', name: 'Hot', sortOrder: 1 })
    const dump = await exportAll()
    await repo.clearAll()
    expect(await repo.all('ingredients')).toHaveLength(0)
    await importAll(dump)
    expect((await repo.get('ingredients', 'm'))!.name).toBe('Milk')
    expect(await repo.all('categories')).toHaveLength(1)
  })
  it('export includes a version and timestamp', async () => {
    const dump = await exportAll()
    expect(dump.version).toBeDefined()
    expect(typeof dump.exportedAt).toBe('number')
  })
})
