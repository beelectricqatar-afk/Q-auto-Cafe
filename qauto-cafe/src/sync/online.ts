// The team's side of online ordering: read the board and move orders along.
// Customers never use this; they go through the place/status functions in
// supabase/online-orders.sql.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'
import type { OnlineOrder, OnlineOrderData, OnlineStatus } from '../domain/online'

interface Row { id: string; status: OnlineStatus; data: OnlineOrderData; created_at: number; updated_at: number }

const headers = (extra?: Record<string, string>): Record<string, string> => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
})

const fromRow = (r: Row): OnlineOrder => ({ id: r.id, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, data: r.data })

export const onlineClient = {
  /** Everything still open, plus whatever was finished since `since` (start of today). */
  async list(since: number): Promise<OnlineOrder[]> {
    const q = `or=(status.in.(pending,accepted,onway),created_at.gte.${since})&order=created_at.desc&limit=200`
    const res = await fetch(`${SUPABASE_URL}/rest/v1/online_orders?select=id,status,data,created_at,updated_at&${q}`, { headers: headers() })
    if (!res.ok) throw new Error(`online orders: HTTP ${res.status}`)
    return ((await res.json()) as Row[]).map(fromRow)
  },

  /** Every online order placed in [from, to), newest first. */
  async history(from: number, to: number): Promise<OnlineOrder[]> {
    const q = `created_at=gte.${from}&created_at=lt.${to}&order=created_at.desc&limit=5000`
    const res = await fetch(`${SUPABASE_URL}/rest/v1/online_orders?select=id,status,data,created_at,updated_at&${q}`, { headers: headers() })
    if (!res.ok) throw new Error(`online history: HTTP ${res.status}`)
    return ((await res.json()) as Row[]).map(fromRow)
  },

  /**
   * Moves an order on, but only from the status this screen saw. Two tablets
   * cannot both accept the same order: the second finds it already moved and
   * gets null back.
   */
  async move(o: OnlineOrder, to: OnlineStatus, data: OnlineOrderData): Promise<OnlineOrder | null> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/online_orders?id=eq.${encodeURIComponent(o.id)}&status=eq.${o.status}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ status: to, data, updated_at: Date.now() }),
    })
    if (!res.ok) throw new Error(`update online order: HTTP ${res.status}`)
    const rows = (await res.json()) as Row[]
    return rows[0] ? fromRow(rows[0]) : null
  },
}
