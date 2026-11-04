// Sync engine: local-first IndexedDB mirrored to Supabase.
//
// syncNow() = push queued local changes, then pull what changed on the server
// since the last sync (a whole table only now and then; see pull) into the
// local mirror, never over a still-pending local write, so offline orders
// are never lost. Runs on app load, on reconnect,
// on tab focus, and after every mutation. No-ops cleanly when offline or
// unconfigured. Also takes a backup snapshot every 12 hours.
import { repo } from '../db/repo'
import { SYNC_TABLES, type StoreName, type Outbox } from '../db/schema'
import { exportAll } from '../db/backup'
import { isConfigured } from './config'
import { client, type Row } from './client'
import { emailBackup } from './emailBackup'

const SYNC_INIT = 'syncInitialized'
const DAILY_HOUR = 22 // 10pm
const DAILY_RETENTION_DAYS = 90

const tableFor = (store: StoreName) => SYNC_TABLES[store]!
const syncStores = () => Object.keys(SYNC_TABLES) as StoreName[]

/** What the last sync managed, so a failure can be surfaced rather than buried. */
export interface SyncStatus {
  at: number
  offline: boolean
  /** Tables whose push or pull failed; they keep their local copy and retry. */
  failed: string[]
  /** Local changes still waiting to reach the cloud. */
  pending: number
}

let running = false
let lastStatus: SyncStatus = { at: 0, offline: false, failed: [], pending: 0 }

export const lastSyncStatus = () => lastStatus

export async function syncNow(): Promise<SyncStatus> {
  const pending = async () => (await repo.outboxAll()).length
  if (!isConfigured() || !navigator.onLine || running) {
    lastStatus = { at: Date.now(), offline: !navigator.onLine, failed: lastStatus.failed, pending: await pending() }
    return lastStatus
  }
  running = true
  const failed = new Set<string>()
  try {
    await backfillFirstRun()
    await pushOutbox(failed)
    await pull(failed)
    await maybeBackup()
  } catch {
    // Offline / transient error: keep local data and the outbox; retry next tick.
  } finally {
    running = false
  }
  lastStatus = { at: Date.now(), offline: false, failed: [...failed].sort(), pending: await pending() }
  return lastStatus
}

// On a device's first ever sync, migrate local data up ONLY if the backend is
// empty (a true first-ever setup). If the backend already has data it is the
// source of truth, so we must NOT re-upload this device's local seed — doing so
// would resurrect items that were deleted on the server. In that case we just
// let pullReplace adopt the server state.
async function backfillFirstRun(): Promise<void> {
  if (await repo.get('meta', SYNC_INIT)) return
  let backendEmpty: boolean
  try {
    backendEmpty = (await client.fetchAll(tableFor('departments'))).length === 0
  } catch {
    return // can't tell yet (transient) — retry on a later sync; don't mark done
  }
  if (backendEmpty) {
    for (const store of syncStores()) {
      const rows = await repo.all<{ id: string }>(store)
      for (const r of rows) await repo.enqueue(store, r.id, 'put', r)
    }
  }
  await repo.put('meta', { id: SYNC_INIT, key: SYNC_INIT, value: true } as any)
}

// Push every queued change. Upserts are batched per table; deletes go one by
// one. Each entry is removed from the outbox only after its push succeeds.
async function pushOutbox(failed: Set<string>): Promise<void> {
  const entries = await repo.outboxAll()
  if (entries.length === 0) return
  const putsByStore = new Map<StoreName, Outbox[]>()
  const dels: Outbox[] = []
  for (const e of entries) {
    if (e.op === 'del') dels.push(e)
    else (putsByStore.get(e.store) ?? putsByStore.set(e.store, []).get(e.store)!).push(e)
  }
  // Per-table/-row resilience: a failure on one (e.g. a not-yet-created table)
  // keeps those entries queued without blocking the rest.
  for (const [store, es] of putsByStore) {
    const rows: Row[] = es.map(e => ({ id: e.id, data: e.record, updated_at: e.updatedAt }))
    try {
      await client.upsert(tableFor(store), rows)
      for (const e of es) await repo.outboxRemove(e.key)
    } catch { failed.add(tableFor(store)) /* keep queued, retry next sync */ }
  }
  for (const e of dels) {
    try { await client.remove(tableFor(e.store), e.id); await repo.outboxRemove(e.key) } catch { failed.add(tableFor(e.store)) }
  }
}

// Each table keeps a bookmark: the database's own time of the newest change
// this device has seen. A sync then downloads only rows written after it,
// and the rows deleted after it, instead of the whole table every time. A
// table with no bookmark yet, or whose last full download is a week old, is
// downloaded whole and rebuilt, which also corrects anything ever missed.
const FULL_EVERY_MS = 7 * 86400000
// Rows a slow transaction stamped just before the bookmark but saved just
// after it would be skipped, so each sync looks back a little further.
const OVERLAP_MS = 2 * 60000
const DELETIONS = 'pull:_deletions'
interface Bookmark { key: string; value: { at: number; fullAt: number } }
const bookmarkKey = (store: StoreName) => `pull:${tableFor(store)}`
const newest = (rows: Row[], from: number) => rows.reduce((m, r) => Math.max(m, r.synced_at ?? 0), from)

async function pull(failed: Set<string>): Promise<void> {
  const now = Date.now()
  const full: StoreName[] = []
  const pending = new Set((await repo.outboxAll()).map(e => e.key))
  const incremental: StoreName[] = []
  for (const store of syncStores()) {
    const b = await repo.get<Bookmark>('meta', bookmarkKey(store))
    if (b && now - b.value.fullAt < FULL_EVERY_MS) incremental.push(store)
    else full.push(store)
  }

  for (const store of incremental) {
    const b = (await repo.get<Bookmark>('meta', bookmarkKey(store)))!
    try {
      const rows = await client.fetchChanged(tableFor(store), b.value.at - OVERLAP_MS)
      // A change still waiting to go up is newer than what the server has.
      await repo.putMany(store, rows.filter(r => !pending.has(`${store}:${r.id}`)).map(r => r.data))
      await repo.put('meta', { key: bookmarkKey(store), value: { at: newest(rows, b.value.at), fullAt: b.value.fullAt } })
    } catch { failed.add(tableFor(store)) /* keep the local copy and the bookmark; try again next sync */ }
  }

  const d = await repo.get<Bookmark>('meta', DELETIONS)
  if (d && incremental.length) {
    try {
      const gone = await client.fetchDeletions(d.value.at - OVERLAP_MS)
      for (const store of incremental) {
        const ids = gone.filter(g => g.tbl === tableFor(store) && !pending.has(`${store}:${g.id}`)).map(g => g.id)
        if (ids.length) await repo.removeMany(store, ids)
      }
      await repo.put('meta', { key: DELETIONS, value: { at: gone.reduce((m, g) => Math.max(m, g.deleted_at), d.value.at), fullAt: d.value.fullAt } })
    } catch { failed.add('sync_deletions') }
  }

  if (full.length) await pullReplace(full, failed, now, !d)
}

// Download whole tables and rebuild their local stores, then overlay any
// outbox changes still pending (protects concurrent/offline writes).
async function pullReplace(stores: StoreName[], failed: Set<string>, now: number, startDeletions: boolean): Promise<void> {
  // Fetch each table independently; a table that fails (missing or transient)
  // is simply skipped so the others still reconcile. `fetchAll` pages internally
  // and throws rather than returning a partial result, so a truncated read can
  // never reach the clear-and-rewrite below.
  const fetched = new Map<StoreName, Map<string, unknown>>()
  let oldest = Infinity
  for (const store of stores) {
    try {
      const rows = await client.fetchAll(tableFor(store))
      fetched.set(store, new Map(rows.map(r => [r.id, r.data])))
      const at = newest(rows, 0)
      // Only a table the database stamps can be followed by its changes;
      // until then (or while it's empty) it is simply downloaded whole.
      if (at > 0) {
        await repo.put('meta', { key: bookmarkKey(store), value: { at, fullAt: now } })
        oldest = Math.min(oldest, at)
      }
    } catch { failed.add(tableFor(store)) /* skip this table, keep local copy */ }
  }
  // Deletions before the first full download are already reflected in it.
  if (startDeletions && oldest < Infinity) await repo.put('meta', { key: DELETIONS, value: { at: oldest, fullAt: now } })
  if (fetched.size === 0) return
  // Overlay pending local writes so they survive the rebuild.
  for (const e of await repo.outboxAll()) {
    const m = fetched.get(e.store)
    if (!m) continue
    if (e.op === 'del') m.delete(e.id)
    else m.set(e.id, e.record)
  }
  for (const [store, m] of fetched) {
    await repo.clear(store)
    await repo.putMany(store, [...m.values()])
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

// Best-effort scheduled backups (triggered whenever a device is open):
// one per day at/after 10pm, and one at the start of each month.
async function maybeBackup(): Promise<void> {
  const now = new Date()
  const dateKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  await ensureBackup('monthly', `monthly-${monthKey}`)
  if (now.getHours() >= DAILY_HOUR) {
    await ensureBackup('daily', `daily-${dateKey}`)
    await client.pruneDailyBackupsBefore(Date.now() - DAILY_RETENTION_DAYS * 86400000)
  }
}

async function ensureBackup(kind: 'daily' | 'monthly', periodKey: string): Promise<void> {
  const marker = `backup:${periodKey}`
  if (await repo.get('meta', marker)) return            // already made on this device
  if (await client.backupExists(periodKey)) {           // or already made on another device
    await repo.put('meta', { id: marker, key: marker, value: true } as any)
    return
  }
  const dump = await exportAll()
  const backup = { kind, periodKey, exportedAt: dump.exportedAt, version: dump.version, data: dump.data }
  await client.insertBackup(backup)
  await emailBackup(backup)
  await repo.put('meta', { id: marker, key: marker, value: true } as any)
}
