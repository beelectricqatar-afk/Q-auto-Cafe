import { describe, it, expect } from 'vitest'
import { aggregateBilling } from './billing'
import type { Order } from '../db/schema'

const orders: Order[] = [
  { id: 'o1', timestamp: 1000, staffId: 's1', departmentId: 'd1', total: 10, lines: [] },
  { id: 'o2', timestamp: 2000, staffId: 's2', departmentId: 'd1', total: 5, lines: [] },
  { id: 'o3', timestamp: 3000, staffId: 's3', departmentId: 'd2', total: 7, lines: [] },
  { id: 'o4', timestamp: 9999, staffId: null, departmentId: null, total: 4, lines: [] },
]

describe('aggregateBilling', () => {
  it('totals per department with per-person breakdown', () => {
    const r = aggregateBilling(orders, { from: 0, to: 5000 })
    const d1 = r.departments.find(d => d.departmentId === 'd1')!
    expect(d1.total).toBe(15)
    expect(d1.orderCount).toBe(2)
    expect(d1.byPerson.find(p => p.staffId === 's1')!.total).toBe(10)
  })
  it('filters by date range (inclusive from, exclusive to)', () => {
    const r = aggregateBilling(orders, { from: 0, to: 5000 })
    expect(r.departments.some(d => d.departmentId === null)).toBe(false) // o4 at 9999 excluded
  })
  it('groups null department under an Unassigned bucket id', () => {
    const r = aggregateBilling(orders, { from: 0, to: 100000 })
    expect(r.departments.find(d => d.departmentId === null)!.total).toBe(4)
  })
})
