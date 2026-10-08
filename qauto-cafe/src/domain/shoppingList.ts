import type { Branch, Request, RequestLine, Unit } from '../db/schema'
import { BULK_UNIT } from './purchase'

/** The cafes as the team names them on a request. */
export const CAFE_LABEL: Record<Branch, string> = { volkswagen: 'VW Cafe', audi: 'Audi Cafe' }
/** VW first: it is the section a new request starts with. */
export const CAFES: Branch[] = ['volkswagen', 'audi']

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * "6 L" rather than "6000 ml", "500 g", "30 pcs". A stock unit with a bigger
 * metric unit switches to it from a whole one up, which is how it is bought.
 */
export function formatQty(qty: number, unit?: Unit, unitLabel?: string): string {
  const bulk = unit && BULK_UNIT[unit]
  if (bulk && qty >= bulk.factor) return `${round3(qty / bulk.factor)} ${bulk.unit}`
  const u = unit ?? unitLabel
  return u ? `${round3(qty)} ${u}` : String(round3(qty))
}

/** What is still to buy for a line. */
export const outstanding = (line: RequestLine) => Math.max(0, round3(line.qty - (line.received ?? 0)))

/**
 * The request written out as text, grouped under cafe headings — the shape the
 * team has always written them in, and what an older device shows.
 */
export function requestMessage(lines: RequestLine[]): string {
  return CAFES
    .filter(cafe => lines.some(l => l.branch === cafe))
    .map(cafe => [CAFE_LABEL[cafe], ...lines.filter(l => l.branch === cafe).map(l => `${l.name} ${formatQty(l.qty, l.unit, l.unitLabel)}`)].join('\n'))
    .join('\n\n')
}

/** Lines for the same thing are added up, whichever request and cafe they came from. */
export const itemKey = (line: Pick<RequestLine, 'ingredientId' | 'name'>) =>
  line.ingredientId ? `id:${line.ingredientId}` : `name:${line.name.trim().toLowerCase()}`

export interface ShoppingItem {
  key: string
  ingredientId?: string
  name: string
  unit?: Unit
  unitLabel?: string
  /** Still to buy, per cafe, in the stock unit. */
  byCafe: Partial<Record<Branch, number>>
  total: number
}

/** Everything still to buy across the given requests, one row per item, oldest request first. */
export function shoppingList(requests: Request[]): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>()
  for (const request of [...requests].sort((a, b) => a.timestamp - b.timestamp)) {
    if (request.done) continue
    for (const line of request.lines ?? []) {
      const left = outstanding(line)
      if (!left) continue
      const key = itemKey(line)
      const item = items.get(key) ?? { key, ingredientId: line.ingredientId, name: line.name, unit: line.unit, unitLabel: line.unitLabel, byCafe: {}, total: 0 }
      item.byCafe[line.branch] = round3((item.byCafe[line.branch] ?? 0) + left)
      item.total = round3(item.total + left)
      items.set(key, item)
    }
  }
  return [...items.values()]
}

export interface ReceivedOutcome {
  /** The requests that changed, ready to save. */
  updated: Request[]
  /** One sentence per request, for the summary. */
  notes: string[]
}

/**
 * Hands what was bought out to the requests that asked for it — oldest request
 * first, so nobody's request is left waiting behind a newer one. A request is
 * done once every line on it is in; anything short stays on the shopping list.
 */
export function receive(requests: Request[], bought: Map<string, number>): ReceivedOutcome {
  const left = new Map(bought)
  const updated: Request[] = []
  const notes: string[] = []
  for (const request of [...requests].sort((a, b) => a.timestamp - b.timestamp)) {
    if (request.done || !request.lines) continue
    let touched = false
    const lines = request.lines.map(line => {
      const key = itemKey(line)
      const available = left.get(key) ?? 0
      const take = Math.min(available, outstanding(line))
      if (take <= 0) return line
      left.set(key, round3(available - take))
      touched = true
      return { ...line, received: round3((line.received ?? 0) + take) }
    })
    if (!touched) continue
    const missing = lines.filter(l => outstanding(l) > 0)
    const who = request.from ? `${request.from}'s request` : 'A request'
    updated.push({ ...request, lines, done: missing.length === 0 })
    notes.push(missing.length === 0
      ? `${who} is fully received`
      : `${who} stays open for ${missing.map(l => `${l.name} (${formatQty(outstanding(l), l.unit, l.unitLabel)}, ${CAFE_LABEL[l.branch]})`).join(', ')}`)
  }
  return { updated, notes }
}
