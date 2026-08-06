import { describe, it, expect } from 'vitest'
import type { Order, Department } from '../db/schema'
import { topItems, topDepartments, avgOrderValue, walkinCount, peakHour, revenue } from './analytics'
import { periodRange } from './dateRanges'

const ts = (h: number) => new Date(2026, 5, 24, h, 0, 0).getTime() // Jun 24 2026, hour h
const order = (o: Partial<Order>): Order => ({ id: Math.random().toString(), timestamp: ts(10), staffId: null, departmentId: null, lines: [], total: 0, ...o })

const depts: Department[] = [{ id: 'd1', name: 'Finance', mainExtension: '', active: true }]

describe('analytics', () => {
  const orders: Order[] = [
    order({ departmentId: 'd1', total: 24, timestamp: ts(9), lines: [{ itemId: 'a', name: 'Latte', qty: 2, unitPrice: 12 }] }),
    order({ walkin: true, total: 8, timestamp: ts(9), lines: [{ itemId: 'b', name: 'Espresso', qty: 1, unitPrice: 8 }] }),
    order({ departmentId: 'd1', total: 12, timestamp: ts(14), lines: [{ itemId: 'a', name: 'Latte', qty: 1, unitPrice: 12 }] }),
  ]
  it('sums revenue and average', () => {
    expect(revenue(orders)).toBe(44)
    expect(avgOrderValue(orders)).toBeCloseTo(14.67, 2)
  })
  it('counts walk-ins', () => { expect(walkinCount(orders)).toBe(1) })
  it('ranks top items by revenue', () => {
    const top = topItems(orders)
    expect(top[0]).toMatchObject({ name: 'Latte', qty: 3, revenue: 36 })
    expect(top[1]).toMatchObject({ name: 'Espresso', qty: 1, revenue: 8 })
  })
  it('ranks departments and labels walk-ins', () => {
    const top = topDepartments(orders, depts)
    expect(top.find(d => d.name === 'Finance')?.total).toBe(36)
    expect(top.find(d => d.name === 'Walk-in')?.total).toBe(8)
  })
  it('finds the peak hour', () => { expect(peakHour(orders)).toBe('9 AM–10 AM') })
})

describe('periodRange', () => {
  const now = new Date(2026, 5, 24, 15, 0, 0) // Wed Jun 24 2026
  it('today starts at local midnight', () => {
    expect(periodRange('today', now).from).toBe(new Date(2026, 5, 24, 0, 0, 0).getTime())
  })
  it('week starts on Monday', () => {
    expect(periodRange('week', now).from).toBe(new Date(2026, 5, 22, 0, 0, 0).getTime()) // Mon Jun 22
  })
  it('month starts on the 1st', () => {
    expect(periodRange('month', now).from).toBe(new Date(2026, 5, 1, 0, 0, 0).getTime())
  })
  it('all starts at 0', () => { expect(periodRange('all', now).from).toBe(0) })
})
