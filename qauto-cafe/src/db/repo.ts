import { getDb } from './database'
import { STORES, SYNC_TABLES, OUTBOX_STORE, type StoreName, type Outbox } from './schema'

// Queue a local change for push to Supabase. Only sync tables are tracked
// (e.g. `meta` is per-device and never pushed).
async function enqueue(store: StoreName, id: string, op: 'put' | 'del', record?: unknown): Promise<void> {
  if (!(store in SYNC_TABLES)) return
  const entry: Outbox = { key: `${store}:${id}`, store, id, op, record, updatedAt: Date.now() }
  await (await getDb()).put(OUTBOX_STORE, entry)
}

export const repo = {
  async all<T = any>(store: StoreName): Promise<T[]> { return (await getDb()).getAll(store) as Promise<T[]> },
  async get<T = any>(store: StoreName, id: string): Promise<T | undefined> { return (await getDb()).get(store, id) as Promise<T | undefined> },
  // Local write that also queues the change for sync (admin CRUD, etc.).
  // `meta` rows have no `id` and aren't a sync table, so enqueue skips them.
  async put<T = any>(store: StoreName, value: T): Promise<void> {
    await (await getDb()).put(store, value as any)
    await enqueue(store, (value as any).id, 'put', value)
  },
  // Bulk write WITHOUT queueing — used by seeding, restore, and sync pull.
  async putMany<T = any>(store: StoreName, values: T[]): Promise<void> {
    const db = await getDb(); const tx = db.transaction(store, 'readwrite')
    await Promise.all(values.map(v => tx.store.put(v as any))); await tx.done
  },
  async remove(store: StoreName, id: string): Promise<void> {
    await (await getDb()).delete(store, id)
    await enqueue(store, id, 'del')
  },
  async clear(store: StoreName): Promise<void> { await (await getDb()).clear(store) },
  async clearAll(): Promise<void> { for (const s of STORES) await (await getDb()).clear(s) },

  // ── Outbox (pending sync changes) ─────────────────────────────────────────
  async outboxAll(): Promise<Outbox[]> { return (await getDb()).getAll(OUTBOX_STORE) as Promise<Outbox[]> },
  async outboxRemove(key: string): Promise<void> { await (await getDb()).delete(OUTBOX_STORE, key) },
  async enqueue(store: StoreName, id: string, op: 'put' | 'del', record?: unknown): Promise<void> { await enqueue(store, id, op, record) },
}
