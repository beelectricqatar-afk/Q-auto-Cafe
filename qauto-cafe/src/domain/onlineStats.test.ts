import { describe, it, expect } from 'vitest'
import { onlineNoOf, onlineStats, type OnlineOrder, type OnlineOrderData, type OnlineStatus } from './online'

const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m).getTime()
let n = 0
function order(status: OnlineStatus, d: Partial<OnlineOrderData>, created = at(10)): OnlineOrder {
  n++
  return {
    id: `o${n}`, status, createdAt: created, updatedAt: created,
    data: { no: n, branch: 'volkswagen', who: 'retail', name: 'A', deliverTo: 'Desk', lines: [{ itemId: 'x', name: 'Latte', qty: 1, unitPrice: 12 }], subtotal: 12, discountPct: 15, total: 10.2, ...d },
  }
}

describe('online history numbers', () => {
  it('counts sales, complimentary and rejected separately', () => {
    const s = onlineStats([
      order('delivered', { paidBy: 'card' }),
      order('delivered', { pay: 'card', paidBy: 'cash' }),
      order('delivered', { who: 'guest', subtotal: 14, total: 14, discountPct: 0, branch: 'audi' }),
      order('rejected', { reason: 'That item is sold out' }),
      order('accepted', { pay: 'card' }),
    ])
    expect(s.orders).toBe(5)
    expect(s.rejected).toBe(1)
    expect(s.open).toBe(1)
    expect(s.sales).toBe(30.6) // three staff orders at 10.20, the rejected one left out
    expect(s.complimentary).toBe(14)
    expect([s.cash, s.card]).toEqual([1, 2]) // what was actually paid wins over what was picked
    expect(s.byCafe).toEqual({ volkswagen: 4, audi: 1 })
    expect([s.staff, s.guests]).toEqual([4, 1])
    expect(s.reasons).toEqual([{ name: 'That item is sold out', n: 1 }])
  })

  it('ranks drinks by cups, ignoring rejected orders', () => {
    const s = onlineStats([
      order('delivered', { lines: [{ itemId: 'a', name: 'Cappuccino ', qty: 2, unitPrice: 12 }] }),
      order('delivered', { lines: [{ itemId: 'b', name: 'Latte', qty: 1, unitPrice: 12 }, { itemId: 'a', name: 'Cappuccino', qty: 1, unitPrice: 12 }] }),
      order('rejected', { lines: [{ itemId: 'b', name: 'Latte', qty: 5, unitPrice: 12 }] }),
    ])
    expect(s.topDrinks).toEqual([{ name: 'Cappuccino', n: 3 }, { name: 'Latte', n: 1 }])
  })

  it('buckets by hour and averages the step times that were recorded', () => {
    const s = onlineStats([
      order('delivered', { acceptedAt: at(9, 2), deliveredAt: at(9, 12) }, at(9)),
      order('delivered', { acceptedAt: at(9, 34), deliveredAt: at(9, 50) }, at(9, 30)),
      order('delivered', {}, at(14)), // handled before the times were kept
    ])
    expect(s.byHour[9]).toBe(2)
    expect(s.byHour[14]).toBe(1)
    expect(s.minsToAccept).toBe(3)
    expect(s.minsToDeliver).toBe(16)
  })

  it('has no times when none were recorded', () => {
    expect(onlineStats([order('delivered', {})]).minsToAccept).toBeNull()
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
