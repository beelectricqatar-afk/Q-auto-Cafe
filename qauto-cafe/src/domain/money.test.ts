import { describe, it, expect } from 'vitest'
import { formatQar, ticketTotal } from './money'
import type { OrderLine } from '../db/schema'

describe('money', () => {
  it('formats QAR with 2 decimals', () => { expect(formatQar(7.5)).toBe('QAR 7.50') })
  it('sums line totals', () => {
    const lines: OrderLine[] = [ { itemId: 'a', name: 'A', qty: 2, unitPrice: 10 }, { itemId: 'b', name: 'B', qty: 1, unitPrice: 3.5 } ]
    expect(ticketTotal(lines)).toBe(23.5)
  })
})
