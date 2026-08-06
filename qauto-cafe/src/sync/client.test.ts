import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { client } from './client'

// A stand-in PostgREST that enforces the same 1000-row cap the real one does.
const CAP = 1000
let requests: string[] = []

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `row-${String(from + i).padStart(6, '0')}`, data: { n: from + i } }))

/** Serves `total` rows, capped per request, recording every URL asked for. */
function serve(total: number, fail?: (offset: number) => boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url)
    const offset = Number(new URL(url).searchParams.get('offset') ?? 0)
    const limit = Math.min(Number(new URL(url).searchParams.get('limit') ?? CAP), CAP)
    if (fail?.(offset)) return { ok: false, status: 500, text: async () => 'boom' } as unknown as Response
    const slice = rows(offset, Math.max(0, Math.min(limit, total - offset)))
    return { ok: true, status: 200, json: async () => slice } as unknown as Response
  }))
}

const offsets = () => requests.map(u => Number(new URL(u).searchParams.get('offset')))

beforeEach(() => { requests = [] })
afterEach(() => { vi.unstubAllGlobals() })

describe('client.fetchAll pagination', () => {
  it('returns every row of a table larger than one page', async () => {
    serve(2300)
    const all = await client.fetchAll('orders')
    expect(all).toHaveLength(2300)
    expect(offsets()).toEqual([0, 1000, 2000])
  })

  it('returns rows in one unbroken sequence with no gaps or repeats', async () => {
    serve(2300)
    const all = await client.fetchAll('orders')
    expect(new Set(all.map(r => r.id)).size).toBe(2300)
    expect(all[0].id).toBe('row-000000')
    expect(all[2299].id).toBe('row-002299')
  })

  it('sorts by id, without which offset paging could skip rows', async () => {
    serve(1500)
    await client.fetchAll('orders')
    for (const url of requests) expect(new URL(url).searchParams.get('order')).toBe('id')
  })

  it('makes a single request for a table that fits in one page', async () => {
    serve(39)
    expect(await client.fetchAll('menu_items')).toHaveLength(39)
    expect(requests).toHaveLength(1)
  })

  it('handles an empty table', async () => {
    serve(0)
    expect(await client.fetchAll('finance_expenses')).toEqual([])
    expect(requests).toHaveLength(1)
  })

  it('asks once more when the count lands exactly on a page boundary', async () => {
    serve(1000)
    expect(await client.fetchAll('orders')).toHaveLength(1000)
    expect(offsets()).toEqual([0, 1000]) // the second page comes back empty
  })

  it('throws rather than returning a partial result when a later page fails', async () => {
    // This is the crux: returning the first 1000 would wipe everything past it,
    // because the caller clears the local store before writing what it got.
    serve(2300, offset => offset === 1000)
    await expect(client.fetchAll('orders')).rejects.toThrow(/fetch orders/)
  })

  it('throws when the very first page fails', async () => {
    serve(2300, offset => offset === 0)
    await expect(client.fetchAll('orders')).rejects.toThrow(/fetch orders/)
  })

  it('reproduces the reported bug: a capped single request loses the newest orders', async () => {
    // What the old code did — one request, no paging — against today's 1016 orders.
    serve(1016)
    const truncated = await (async () => {
      const res = await fetch(`x://h/rest/v1/orders?select=id,data&limit=${CAP}&offset=0`) as Response
      return res.json() as Promise<unknown[]>
    })()
    expect(truncated).toHaveLength(1000) // 16 orders invisible
    requests = []
    expect(await client.fetchAll('orders')).toHaveLength(1016) // all of them now
  })
})
