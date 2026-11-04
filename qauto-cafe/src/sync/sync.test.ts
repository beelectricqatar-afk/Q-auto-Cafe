import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for Supabase so we can exercise a full push→pull round-trip.
const { server, broken, pushBroken, deletions, clock, calls } = vi.hoisted(() => ({
  server: new Map<string, Map<string, any>>(),
  broken: new Set<string>(), // tables the fake backend refuses, e.g. a missing one
  pushBroken: new Set<string>(), // tables it reads but refuses writes to
  deletions: [] as { tbl: string; id: string; deleted_at: number }[],
  // The database's own clock: every write is stamped, ten minutes apart.
  clock: { now: 1_000_000_000_000, stamp: true, tick() { this.now += 600_000; return this.now } },
  calls: { full: [] as string[], changed: [] as string[] },
}))
const stamp = <T extends object>(r: T): T => clock.stamp ? { ...r, synced_at: clock.tick() } : r
vi.mock('./client', () => ({
  client: {
    async fetchAll(table: string) {
      if (broken.has(table)) throw new Error(`fetch ${table}: HTTP 404`)
      calls.full.push(table)
      return [...(server.get(table)?.values() ?? [])].map(r => ({ id: r.id, data: r.data, synced_at: r.synced_at }))
    },
    async fetchChanged(table: string, since: number) {
      if (broken.has(table)) throw new Error(`fetch ${table}: HTTP 404`)
      calls.changed.push(table)
      return [...(server.get(table)?.values() ?? [])].filter(r => r.synced_at > since).map(r => ({ id: r.id, data: r.data, synced_at: r.synced_at }))
    },
    async fetchDeletions(since: number) { return deletions.filter(d => d.deleted_at > since) },
    async upsert(table: string, rows: any[]) {
      if (broken.has(table) || pushBroken.has(table)) throw new Error(`upsert ${table}: HTTP 409`)
      const m = server.get(table) ?? server.set(table, new Map()).get(table)!
      for (const r of rows) m.set(r.id, stamp(r))
    },
    async remove(table: string, id: string) { server.get(table)?.delete(id); deletions.push({ tbl: table, id, deleted_at: clock.tick() }) },
    async insertBackup() {},
  },
}))

import { repo } from '../db/repo'
import { syncNow } from './sync'

async function clearOutbox() { for (const e of await repo.outboxAll()) await repo.outboxRemove(e.key) }

/** Puts rows straight on the server, as another device would. */
function onServer(table: string, ...rows: ({ id: string } & Record<string, unknown>)[]) {
  const m = server.get(table) ?? server.set(table, new Map()).get(table)!
  for (const r of rows) m.set(r.id, stamp({ id: r.id, data: r }))
}

beforeEach(async () => {
  server.clear(); broken.clear(); pushBroken.clear(); deletions.length = 0; calls.full.length = 0; calls.changed.length = 0; clock.stamp = true
  vi.useRealTimers()
  await repo.clearAll(); await clearOutbox()
})

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

describe('downloading only what changed', () => {
  beforeEach(async () => { await repo.put('meta', { key: 'syncInitialized', value: true }) })

  it('downloads a table whole once, then only its changes', async () => {
    onServer('staff', { id: 's1', name: 'Alice', active: true })
    await syncNow()
    expect(calls.full).toContain('staff')
    calls.full.length = 0
    await syncNow()
    expect(calls.full).not.toContain('staff')
    expect(calls.changed).toContain('staff')
  })

  it('picks up a change another device made', async () => {
    onServer('staff', { id: 's1', name: 'Alice', active: true })
    await syncNow()
    onServer('staff', { id: 's1', name: 'Alice B', active: true }, { id: 's2', name: 'Bob', active: true })
    await syncNow()
    expect((await repo.get('staff', 's1'))?.name).toBe('Alice B')
    expect((await repo.get('staff', 's2'))?.name).toBe('Bob')
  })

  it('removes a row another device deleted', async () => {
    onServer('categories', { id: 'c1', name: 'Hot', sortOrder: 1 }, { id: 'c2', name: 'Iced', sortOrder: 2 })
    await syncNow()
    server.get('categories')!.delete('c2'); deletions.push({ tbl: 'categories', id: 'c2', deleted_at: clock.tick() })
    await syncNow()
    expect(await repo.get('categories', 'c2')).toBeUndefined()
    expect(await repo.get('categories', 'c1')).toBeDefined()
  })

  it('never overwrites a change that could not go up yet', async () => {
    onServer('categories', { id: 'c1', name: 'Hot', sortOrder: 1 })
    await syncNow()
    pushBroken.add('categories') // it can't go up, but downloads still work
    await repo.put('categories', { id: 'c1', name: 'Hot Drinks', sortOrder: 1 })
    onServer('categories', { id: 'c1', name: 'Hot (other device)', sortOrder: 1 })
    await syncNow()
    expect((await repo.get('categories', 'c1'))?.name).toBe('Hot Drinks')
    pushBroken.delete('categories')
    await syncNow() // now it goes up, and comes back down as the server's copy
    expect(server.get('categories')?.get('c1')?.data.name).toBe('Hot Drinks')
    expect((await repo.get('categories', 'c1'))?.name).toBe('Hot Drinks')
  })

  it('keeps an order made offline when the server has other changes', async () => {
    onServer('orders', { id: 'o1', total: 10 })
    await syncNow()
    broken.add('orders')
    await repo.put('orders', { id: 'o2', total: 12 })
    await syncNow() // o2 can't go up; it stays queued and local
    broken.delete('orders')
    onServer('orders', { id: 'o3', total: 8 })
    await syncNow()
    expect((await repo.all<{ id: string }>('orders')).map(o => o.id).sort()).toEqual(['o1', 'o2', 'o3'])
    expect(server.get('orders')?.has('o2')).toBe(true)
  })

  it('downloads whole again once a week, to correct anything ever missed', async () => {
    onServer('staff', { id: 's1', name: 'Alice', active: true })
    await syncNow()
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 8 * 86400000)
    calls.full.length = 0
    await syncNow()
    expect(calls.full).toContain('staff')
  })

  it('says when something new came in, so open screens re-read', async () => {
    onServer('orders', { id: 'o1', total: 10 })
    expect((await syncNow()).changed).toBe(true) // the first, whole download
    expect((await syncNow()).changed).toBe(false) // nothing new since
    onServer('orders', { id: 'o2', total: 12 })
    expect((await syncNow()).changed).toBe(true)
    server.get('orders')!.delete('o1'); deletions.push({ tbl: 'orders', id: 'o1', deleted_at: clock.tick() })
    expect((await syncNow()).changed).toBe(true)
    expect((await syncNow()).changed).toBe(false)
  })

  it('keeps downloading whole tables until the database stamps its rows', async () => {
    clock.stamp = false
    onServer('staff', { id: 's1', name: 'Alice', active: true })
    await syncNow(); calls.full.length = 0
    await syncNow()
    expect(calls.full).toContain('staff')
    expect(calls.changed).not.toContain('staff')
  })
})
