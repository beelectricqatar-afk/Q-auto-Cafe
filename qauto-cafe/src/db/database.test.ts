import { describe, it, expect } from 'vitest'
import { getDb } from './database'
import { STORES } from './schema'

describe('database', () => {
  it('creates all object stores', async () => {
    const db = await getDb()
    for (const s of STORES) expect(db.objectStoreNames.contains(s)).toBe(true)
  })
})
