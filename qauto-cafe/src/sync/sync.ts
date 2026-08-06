// Sync engine: local-first IndexedDB mirrored to Supabase.
//
// syncNow() = push queued local changes, then pull the authoritative server
// state and rebuild the local mirror (overlaying any still-pending local
// writes so offline orders are never lost). Runs on app load, on reconnect,
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
    await pullReplace(failed)
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

// Pull the full server state for every table and rebuild local stores, then
// overlay any outbox changes still pending (protects concurrent/offline writes).
async function pullReplace(failed: Set<string>): Promise<void> {
  // Fetch each table independently; a table that fails (missing or transient)
  // is simply skipped so the others still reconcile. `fetchAll` pages internally
  // and throws rather than returning a partial result, so a truncated read can
  // never reach the clear-and-rewrite below.
  const fetched = new Map<StoreName, Map<string, unknown>>()
  for (const store of syncStores()) {
    try {
      const rows = await client.fetchAll(tableFor(store))
      fetched.set(store, new Map(rows.map(r => [r.id, r.data])))
    } catch { failed.add(tableFor(store)) /* skip this table, keep local copy */ }
  }
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
