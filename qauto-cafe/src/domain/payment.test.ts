import { describe, it, expect } from 'vitest'
import { PAYMENT_METHODS, ordersByPayment, paymentLabel } from './payment'
import type { Order } from '../db/schema'

const order = (id: string, total: number, paymentMethod?: Order['paymentMethod']): Order =>
  ({ id, timestamp: 1, staffId: null, departmentId: null, walkin: true, total, paymentMethod, lines: [] })
const deptOrder = (id: string, total: number): Order =>
  ({ id, timestamp: 1, staffId: 's1', departmentId: 'd1', total, lines: [] })

describe('paymentLabel', () => {
  it('names both methods', () => {
    expect(paymentLabel('cash')).toBe('Cash')
    expect(paymentLabel('card')).toBe('Card')
  })
  it('is blank for an order taken before the till asked', () => {
    expect(paymentLabel(undefined)).toBe('')
  })
  it('offers cash first, as the barista sees it', () => {
    expect([...PAYMENT_METHODS]).toEqual(['cash', 'card'])
  })
})

describe('ordersByPayment', () => {
  it('totals each method separately, biggest first', () => {
    expect(ordersByPayment([
      order('a', 10, 'cash'), order('b', 25, 'card'), order('c', 5, 'cash'),
    ])).toEqual([
      { name: 'Card', qty: 1, value: 25 },
      { name: 'Cash', qty: 2, value: 15 },
    ])
  })

  it('does not assume old walk-ins were cash', () => {
    // A walk-in with nothing recorded predates the till asking. Calling it cash
    // would state something never captured.
    expect(ordersByPayment([order('a', 10, 'card'), order('b', 7)])).toEqual([
      { name: 'Card', qty: 1, value: 10 },
      { name: 'Unassigned', qty: 1, value: 7 },
    ])
  })

  it('reports a department order as charged, not as a missing payment', () => {
    // Only walk-ins pay at the till, so a department order having no method is
    // correct rather than a gap in the data.
    expect(ordersByPayment([deptOrder('a', 40)])).toEqual([
      { name: 'Charged to department', qty: 1, value: 40 },
    ])
  })

  it('separates till takings from department billing', () => {
    expect(ordersByPayment([order('a', 10, 'cash'), deptOrder('b', 30), order('c', 5, 'card')])).toEqual([
      { name: 'Charged to department', qty: 1, value: 30 },
      { name: 'Cash', qty: 1, value: 10 },
      { name: 'Card', qty: 1, value: 5 },
    ])
  })

  it('rounds money to two decimals', () => {
    expect(ordersByPayment([order('a', 10.1, 'cash'), order('b', 0.2, 'cash')])[0].value).toBe(10.3)
  })

  it('returns nothing for no orders', () => {
    expect(ordersByPayment([])).toEqual([])
  })
})
