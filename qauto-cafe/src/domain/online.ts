// Online orders from the customer site (qautocafe.vercel.app).
//
// The customer's order waits in Supabase's `online_orders` until a barista
// accepts it. Accepting turns it into an ordinary POS order through placeOrder,
// so stock, billing and finance treat it exactly like one taken at the counter.
import type { Branch, MenuItem, PaymentMethod, RecipeLine, Staff } from '../db/schema'
import type { PlaceOrderInput } from '../features/barista/placeOrder'
import { swapMilk, type MilkPair } from './milk'
import { applyDiscount } from './money'

export type OnlineStatus = 'pending' | 'accepted' | 'onway' | 'delivered' | 'rejected'
export type OnlineMilk = 'fresh' | 'lactose-free'

/** One line as the server priced it. */
export interface OnlineLine { itemId: string; name: string; qty: number; unitPrice: number; milk?: OnlineMilk }

/** What the customer sent, priced by the server, plus what the team adds. */
export interface OnlineOrderData {
  no: number
  branch: Branch
  /** 'guest' is complimentary and billed to the host's department; 'retail' is a walk-in sale. */
  who: 'guest' | 'retail'
  name: string
  /** Guest: the extension of the person they are visiting. */
  ext?: string
  /** Retail: 8 digits, no +974. */
  mobile?: string
  /** Retail: how they said they would pay. */
  pay?: PaymentMethod
  deliverTo: string
  note?: string
  lines: OnlineLine[]
  subtotal: number
  discountPct: number
  total: number
  /** Set by the team. */
  hostStaffId?: string
  orderId?: string
  paidBy?: PaymentMethod
  reason?: string
}

export interface OnlineOrder { id: string; status: OnlineStatus; createdAt: number; updatedAt: number; data: OnlineOrderData }

/** The 15% a Staff (retail) order arrives with, and the counter's own 15% Off. */
export const STAFF_DISCOUNT = 15

const digits = (s: string) => s.replace(/\D/g, '')

/**
 * Everyone on an extension. The directory writes it as "44455 (242)": the
 * number in brackets is what people quote, so that is what matches. The whole
 * number matches too, for someone who typed it all.
 */
export function staffOnExtension(ext: string, staff: Staff[]): Staff[] {
  const want = digits(ext)
  if (!want) return []
  return staff.filter(s => {
    if (!s.active) return false
    const inBrackets = /\((\d+)\)/.exec(s.extension)?.[1]
    return inBrackets === want || digits(s.extension) === want
  })
}

/** The host a guest named, when exactly one person has that extension. */
export function hostByExtension(ext: string, staff: Staff[]): Staff | null {
  const on = staffOnExtension(ext, staff)
  return on.length === 1 ? on[0] : null
}

/** The person a retail mobile belongs to, when exactly one active person has it. */
export function staffByMobile(mobile: string, staff: Staff[]): Staff | null {
  const want = digits(mobile)
  if (want.length !== 8) return null
  const on = staff.filter(s => s.active && s.mobile === want)
  return on.length === 1 ? on[0] : null
}

/** The recipe a line is made with: the menu's, with the milk swapped when asked. */
function recipeWithMilk(item: MenuItem | undefined, milk: OnlineMilk | undefined, pair: MilkPair | null): RecipeLine[] | undefined {
  if (!item || !milk || !pair) return undefined
  const [from, to] = milk === 'lactose-free' ? [pair.fresh.id, pair.lactoseFree.id] : [pair.lactoseFree.id, pair.fresh.id]
  if (!item.recipe.some(l => l.ingredientId === from)) return undefined
  return swapMilk(item.recipe, from, to)
}

/**
 * The POS order an accepted online order becomes.
 *
 * A guest goes on the host's department, like any department order, with a note
 * saying whose guest it was. A retail order stays a walk-in that pays cash or
 * card; a matched mobile only decides the name and person it is saved under.
 */
export function toPlaceOrderInput(
  o: OnlineOrder,
  opts: { host: Staff | null; staff: Staff[]; menuItems: MenuItem[]; milk: MilkPair | null; discountPct: number },
): PlaceOrderInput {
  const d = o.data
  const lines = d.lines.map(l => {
    const recipe = recipeWithMilk(opts.menuItems.find(i => i.id === l.itemId), l.milk, opts.milk)
    return { itemId: l.itemId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, ...(recipe && { recipe }) }
  })
  const base = { lines, branch: d.branch, discountPct: opts.discountPct, onlineOrderId: o.id }
  if (d.who === 'guest') {
    if (!opts.host) throw new Error('Choose who the guest is visiting first')
    return {
      ...base,
      staffId: opts.host.id,
      departmentId: opts.host.departmentId,
      note: `Online #${d.no} · Guest: ${d.name} · Deliver to ${d.deliverTo}`,
    }
  }
  const person = staffByMobile(d.mobile ?? '', opts.staff)
  return {
    ...base,
    staffId: null,
    departmentId: null,
    walkin: true,
    customerName: person?.name ?? d.name,
    walkinStaffId: person?.id,
    paymentMethod: d.paidBy ?? d.pay,
    note: `Online #${d.no} · Deliver to ${d.deliverTo}`,
  }
}

/** The total the customer sees once the team has set the discount. */
export function totalWith(o: OnlineOrder, discountPct: number): number {
  return applyDiscount(o.data.subtotal, discountPct)
}

/** Board columns. */
export function columnOf(status: OnlineStatus): 'new' | 'making' | 'done' {
  return status === 'pending' ? 'new' : status === 'accepted' || status === 'onway' ? 'making' : 'done'
}

/** The online number a POS order came from, read from the note accepting wrote on it. */
export function onlineNoOf(note: string | undefined): number | null {
  const m = /^Online #(\d+)/.exec(note ?? '')
  return m ? Number(m[1]) : null
}

const r2 = (n: number) => Math.round(n * 100) / 100

export interface OnlineStats {
  orders: number
  rejected: number
  /** Staff (retail) orders that weren't rejected: what was, or will be, paid. */
  sales: number
  cash: number
  card: number
  /** Guest orders that weren't rejected, at menu price. */
  complimentary: number
  guestOrders: number
}

/** What the online orders in a period add up to. Rejected orders count as orders but not as money. */
export function onlineStats(list: OnlineOrder[]): OnlineStats {
  const s: OnlineStats = { orders: list.length, rejected: 0, sales: 0, cash: 0, card: 0, complimentary: 0, guestOrders: 0 }
  for (const o of list) {
    const d = o.data
    if (o.status === 'rejected') { s.rejected++; continue }
    if (d.who === 'guest') { s.guestOrders++; s.complimentary += d.subtotal; continue }
    s.sales += d.total
    if ((d.paidBy ?? d.pay) === 'cash') s.cash++; else s.card++
  }
  s.sales = r2(s.sales); s.complimentary = r2(s.complimentary)
  return s
}
