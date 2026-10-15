import { describe, it, expect } from 'vitest'
import { onlineNoOf, onlineStats, type OnlineOrder, type OnlineOrderData, type OnlineStatus } from './online'

let n = 0
function order(status: OnlineStatus, d: Partial<OnlineOrderData>): OnlineOrder {
  n++
  return {
    id: `o${n}`, status, createdAt: 0, updatedAt: 0,
    data: { no: n, branch: 'volkswagen', who: 'retail', name: 'A', deliverTo: 'Desk', lines: [{ itemId: 'x', name: 'Latte', qty: 1, unitPrice: 12 }], subtotal: 12, discountPct: 15, total: 10.2, ...d },
  }
}

describe('online history totals', () => {
  it('counts sales, complimentary and rejected separately', () => {
    const s = onlineStats([
      order('delivered', { paidBy: 'card' }),
      order('delivered', { pay: 'card', paidBy: 'cash' }),
      order('delivered', { who: 'guest', subtotal: 14, total: 14, discountPct: 0 }),
      order('rejected', { reason: 'That item is sold out' }),
      order('rejected', { who: 'guest', subtotal: 20, total: 20 }),
      order('accepted', { pay: 'card' }),
    ])
    expect(s.orders).toBe(6)
    expect(s.rejected).toBe(2)
    expect(s.sales).toBe(30.6) // three staff orders at 10.20, the rejected one left out
    expect([s.cash, s.card]).toEqual([1, 2]) // what was actually paid wins over what was picked
    expect(s.complimentary).toBe(14)
    expect(s.guestOrders).toBe(1)
  })

  it('is all zero for an empty period', () => {
    expect(onlineStats([])).toEqual({ orders: 0, rejected: 0, sales: 0, cash: 0, card: 0, complimentary: 0, guestOrders: 0 })
  })
})

describe('the online number on a POS order', () => {
  it('reads it from the note accepting wrote', () => {
    expect(onlineNoOf('Online #12 · Deliver to Desk 4')).toBe(12)
    expect(onlineNoOf('Online #3 · Guest: Sam · Deliver to Lobby')).toBe(3)
    expect(onlineNoOf('extra hot')).toBeNull()
    expect(onlineNoOf(undefined)).toBeNull()
  })
})
