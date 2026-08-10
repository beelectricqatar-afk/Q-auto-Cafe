import { describe, it, expect } from 'vitest'
import { BRANCHES, branchLabel, ordersByBranch } from './branch'
import type { Order } from '../db/schema'

const order = (id: string, total: number, branch?: Order['branch']): Order =>
  ({ id, timestamp: 1, staffId: null, departmentId: null, total, branch, lines: [] })

describe('branchLabel', () => {
  it('names both cafes', () => {
    expect(branchLabel('audi')).toBe('Audi')
    expect(branchLabel('volkswagen')).toBe('Volkswagen')
  })
  it('is blank for an order placed before branches existed', () => {
    expect(branchLabel(undefined)).toBe('')
  })
  it('lists the cafes in the order the barista sees them', () => {
    expect([...BRANCHES]).toEqual(['audi', 'volkswagen'])
  })
})

describe('ordersByBranch', () => {
  it('totals each cafe separately, biggest first', () => {
    expect(ordersByBranch([
      order('a', 10, 'audi'), order('b', 5, 'volkswagen'), order('c', 20, 'audi'),
    ])).toEqual([
      { name: 'Audi', orderCount: 2, value: 30 },
      { name: 'Volkswagen', orderCount: 1, value: 5 },
    ])
  })

  it('keeps untagged orders visible rather than dropping them', () => {
    // Every order taken before this feature has no branch; they must still count.
    expect(ordersByBranch([order('a', 10, 'audi'), order('b', 7)])).toEqual([
      { name: 'Audi', orderCount: 1, value: 10 },
      { name: 'Unassigned', orderCount: 1, value: 7 },
    ])
  })

  it('rounds money to two decimals', () => {
    expect(ordersByBranch([order('a', 10.1, 'audi'), order('b', 0.2, 'audi')])[0].value).toBe(10.3)
  })

  it('returns nothing for no orders', () => {
    expect(ordersByBranch([])).toEqual([])
  })
})
