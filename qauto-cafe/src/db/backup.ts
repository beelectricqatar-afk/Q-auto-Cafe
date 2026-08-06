import { repo } from './repo'
import { STORES, DB_VERSION, type StoreName } from './schema'

export interface Backup { version: number; exportedAt: number; data: Record<string, unknown[]> }

export async function exportAll(): Promise<Backup> {
  const data: Record<string, unknown[]> = {}
  for (const s of STORES) data[s] = await repo.all(s)
  return { version: DB_VERSION, exportedAt: Date.now(), data }
}

export async function importAll(backup: Backup): Promise<void> {
  for (const s of STORES) {
    await repo.clear(s)
    const rows = backup.data[s] ?? []
    if (rows.length) await repo.putMany(s as StoreName, rows)
  }
}
