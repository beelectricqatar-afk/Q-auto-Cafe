import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for Supabase so we can exercise a full push→pull round-trip.
const { server, broken } = vi.hoisted(() => ({
  server: new Map<string, Map<string, any>>(),
  broken: new Set<string>(), // tables the fake backend refuses, e.g. a missing one
}))
vi.mock('./client', () => ({
  client: {
    async fetchAll(table: string) {
      if (broken.has(table)) throw new Error(`fetch ${table}: HTTP 404`)
      return [...(server.get(table)?.values() ?? [])].map(r => ({ id: r.id, data: r.data }))
    },
    async upsert(table: string, rows: any[]) {
      if (broken.has(table)) throw new Error(`upsert ${table}: HTTP 404`)
      const m = server.get(table) ?? server.set(table, new Map()).get(table)!
      for (const r of rows) m.set(r.id, r)
    },
    async remove(table: string, id: string) { server.get(table)?.delete(id) },
    async insertBackup() {},
  },
}))

import { repo } from '../db/repo'
import { syncNow } from './sync'

async function clearOutbox() { for (const e of await repo.outboxAll()) await repo.outboxRemove(e.key) }

beforeEach(async () => { server.clear(); broken.clear(); await repo.clearAll(); await clearOutbox() })

describe('syncNow', () => {
  it('pushes a local write up, clears the outbox, and keeps it locally', async () => {
    await repo.put('categories', { id: 'c1', name: 'Hot Drinks', sortOrder: 1 })
    await syncNow()
    expect(server.get('categories')?.get('c1')?.data.name).toBe('Hot Drinks')
    expect(await repo.outboxAll()).toHaveLength(0)
    expect((await repo.get('categories', 'c1'))?.name).toBe('Hot Drinks')
  })

  it('pulls a server-only record down into local', async () => {
    server.set('staff', new Map([['s1', { id: 's1', data: { id: 's1', name: 'Alice', active: true } }]]))
    await syncNow()
    expect((await repo.get('staff', 's1'))?.name).toBe('Alice')
  })

  it('drops a local record that no longer exists on the server', async () => {
    // Simulate an already-initialized device (first-run backfill won't re-upload).
    await repo.put('meta', { key: 'syncInitialized', value: true })
    // Present locally and already synced (so it is not pending in the outbox).
    await repo.putMany('categories', [{ id: 'gone', name: 'Old', sortOrder: 9 }])
    await syncNow() // server returns nothing for categories
    expect(await repo.get('categories', 'gone')).toBeUndefined()
  })

  it('does not resurrect server-deleted items when a fresh device joins a populated backend', async () => {
    // Backend already has data (so it is authoritative) — one menu item survives.
    server.set('departments', new Map([['d1', { id: 'd1', data: { id: 'd1', name: 'Finance' } }]]))
    server.set('menu_items', new Map([['m1', { id: 'm1', data: { id: 'm1', name: 'Latte' } }]]))
    // This device was locally seeded with m1 AND m2 (m2 was deleted on the server).
    await repo.putMany('menuItems', [{ id: 'm1', name: 'Latte' }, { id: 'm2', name: 'GhostItem' }])
    await syncNow() // first run on this device, backend non-empty -> no backfill
    expect((await repo.all<{ id: string }>('menuItems')).map(i => i.id).sort()).toEqual(['m1'])
    expect(server.get('menu_items')?.has('m2')).toBe(false) // never re-uploaded
  })

  it('propagates a delete to the server', async () => {
    server.set('categories', new Map([['c1', { id: 'c1', data: { id: 'c1', name: 'Hot', sortOrder: 1 } }]]))
    await syncNow()
    await repo.remove('categories', 'c1')
    await syncNow()
    expect(server.get('categories')?.get('c1')).toBeUndefined()
    expect(await repo.get('categories', 'c1')).toBeUndefined()
  })
})

describe('syncNow status', () => {
  it('reports a clean sync as having nothing wrong', async () => {
    const status = await syncNow()
    expect(status).toMatchObject({ offline: false, failed: [], pending: 0 })
    expect(status.at).toBeGreaterThan(0)
  })

  it('names a table it could not reach', async () => {
    // deletion_logs does not exist on the real backend; this is that case.
    broken.add('deletion_logs')
    expect((await syncNow()).failed).toContain('deletion_logs')
  })

  it('keeps syncing every other table when one is unreachable', async () => {
    broken.add('deletion_logs')
    server.set('staff', new Map([['s1', { id: 's1', data: { id: 's1', name: 'Alice', active: true } }]]))
    await syncNow()
    expect((await repo.get('staff', 's1'))?.name).toBe('Alice')
  })

  it('reports a push failure, not only a pull one', async () => {
    await repo.put('meta', { key: 'syncInitialized', value: true })
    broken.add('categories')
    await repo.put('categories', { id: 'c1', name: 'Hot Drinks', sortOrder: 1 })
    expect((await syncNow()).failed).toContain('categories')
  })

  it('counts changes still waiting to reach the cloud', async () => {
    await repo.put('meta', { key: 'syncInitialized', value: true })
    broken.add('categories')
    await repo.put('categories', { id: 'c1', name: 'Hot Drinks', sortOrder: 1 })
    const status = await syncNow()
    expect(status.pending).toBe(1) // still queued, so the till can show it
    expect(await repo.outboxAll()).toHaveLength(1)
  })

  it('clears the pending count once the change lands', async () => {
    await repo.put('categories', { id: 'c1', name: 'Hot Drinks', sortOrder: 1 })
    expect((await syncNow()).pending).toBe(0)
  })
})
