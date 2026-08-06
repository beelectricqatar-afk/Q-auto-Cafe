// Minimal Supabase REST (PostgREST) client — just what sync needs.
// Each row is { id, data: <full record>, updated_at }.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

export interface Row { id: string; data: unknown; updated_at?: number }

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${await res.text()}`)
  return res
}

// PostgREST caps a response at the project's `db-max-rows` (1000 by default), so
// a single request silently truncates a big table. Since the sync layer clears
// each local store before rewriting it from this result, a truncated fetch would
// erase the rest — so pages are walked until a short one comes back.
const PAGE = 1000
const MAX_PAGES = 200 // a stop, so a misbehaving server cannot spin forever

export const client = {
  async fetchAll(table: string): Promise<Row[]> {
    const all: Row[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      // `order=id` is essential: offset paging without a stable sort can skip
      // rows, which here would silently drop orders.
      const url = `${SUPABASE_URL}/rest/v1/${table}?select=id,data&order=id&limit=${PAGE}&offset=${page * PAGE}`
      const res = await ok(await fetch(url, { headers: headers() }), `fetch ${table}`)
      const rows: Row[] = await res.json()
      all.push(...rows)
      // Anything short of a full page means the end. A failed page throws above
      // rather than returning what it has, so a partial result never reaches the
      // caller and cannot wipe local data.
      if (rows.length < PAGE) return all
    }
    throw new Error(`fetch ${table}: more than ${MAX_PAGES * PAGE} rows`)
  },
  async upsert(table: string, rows: Row[]): Promise<void> {
    if (rows.length === 0) return
    await ok(await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows),
    }), `upsert ${table}`)
  },
  async remove(table: string, id: string): Promise<void> {
    await ok(await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    }), `delete ${table}`)
  },
  async insertBackup(payload: unknown): Promise<void> {
    await ok(await fetch(`${SUPABASE_URL}/rest/v1/backups`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ payload }),
    }), 'insert backup')
  },
  async listBackups(): Promise<{ id: string; created_at: number; payload: any }[]> {
    const res = await ok(await fetch(`${SUPABASE_URL}/rest/v1/backups?select=id,created_at,payload&order=created_at.desc`, { headers: headers() }), 'list backups')
    return res.json()
  },
  async backupExists(periodKey: string): Promise<boolean> {
    const res = await ok(await fetch(`${SUPABASE_URL}/rest/v1/backups?select=id&payload->>periodKey=eq.${encodeURIComponent(periodKey)}&limit=1`, { headers: headers() }), 'check backup')
    return (await res.json()).length > 0
  },
  async pruneDailyBackupsBefore(beforeMs: number): Promise<void> {
    await fetch(`${SUPABASE_URL}/rest/v1/backups?payload->>kind=eq.daily&created_at=lt.${beforeMs}`, {
      method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }),
    })
  },

  // Requests are stored directly in the shared `meta` table (id prefixed
  // `req:`) so they are visible on every device without a dedicated table.
  async listRequests(): Promise<any[]> {
    const res = await ok(await fetch(`${SUPABASE_URL}/rest/v1/meta?select=data&id=like.req:*`, { headers: headers() }), 'list requests')
    return (await res.json()).map((r: any) => r.data)
  },
  async saveRequest(req: any): Promise<void> {
    await ok(await fetch(`${SUPABASE_URL}/rest/v1/meta?on_conflict=id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ id: `req:${req.id}`, data: req, updated_at: Date.now() }]),
    }), 'save request')
  },
  async deleteRequest(id: string): Promise<void> {
    await ok(await fetch(`${SUPABASE_URL}/rest/v1/meta?id=eq.req:${id}`, {
      method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }),
    }), 'delete request')
  },
}
