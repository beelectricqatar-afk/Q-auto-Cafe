import { describe, it, expect } from 'vitest'
import type { Ingredient } from '../db/schema'
import { applyPurchase, formatUnitPrice, priceChangePct, purchaseDescription, undoPurchase, unitPrice, type PurchaseInput } from './purchase'

const milk: Ingredient = { id: 'milk', name: 'Fresh Milk', unit: 'ml', stockQty: 3000, lowStockThreshold: 2000, unitCostQar: 0.006 }
const orange: Ingredient = { id: 'orange', name: 'Orange', unit: 'pcs', stockQty: 12, lowStockThreshold: 10 }

const input = (over: Partial<PurchaseInput> = {}): PurchaseInput => ({
  date: '2026-10-08', vendor: 'Lulu', receiptNumber: 'INV-1', paidBy: 'Card',
  lines: [
    { ingredientId: 'milk', name: 'Fresh Milk', qty: 6000, totalQar: 39 },
    { ingredientId: 'orange', name: 'Orange', qty: 15, totalQar: 20 },
    { name: 'Gloves', qty: 1, totalQar: 12.5 },
  ],
  ...over,
})

describe('unit prices', () => {
  it('divides the line total by what was bought', () => {
    expect(unitPrice({ qty: 15, totalQar: 20 })).toBe(1.3333)
    expect(unitPrice({ qty: 0, totalQar: 20 })).toBe(0)
  })
  it('keeps a tiny price per ml readable instead of 0.00', () => {
    expect(formatUnitPrice(0.0065)).toBe('0.0065')
    expect(formatUnitPrice(1.3333)).toBe('1.33')
    expect(formatUnitPrice(0)).toBe('0.00')
  })
  it('compares with the last price', () => {
    expect(priceChangePct(1.33, 0.9)).toBe(48)
    expect(priceChangePct(1, undefined)).toBeNull()
  })
})

describe('applyPurchase', () => {
  const result = applyPurchase(input(), [milk, orange], 1000)

  it('adds what was bought to stock', () => {
    const byId = Object.fromEntries(result.ingredients.map(i => [i.id, i]))
    expect(byId.milk.stockQty).toBe(9000)
    expect(byId.orange.stockQty).toBe(27)
    expect(result.adjustments.map(a => [a.ingredientId, a.delta, a.reason])).toEqual([['milk', 6000, 'restock'], ['orange', 15, 'restock']])
  })

  it('sets each item cost to this receipt and keeps the history', () => {
    const o = result.ingredients.find(i => i.id === 'orange')!
    expect(o.unitCostQar).toBe(1.3333)
    expect(o.priceHistory).toEqual([{ date: '2026-10-08', priceQar: 1.3333, vendor: 'Lulu', expenseId: result.expense.id }])
  })

  it('raises one expense for the receipt total, lines and all', () => {
    const e = result.expense
    expect(e.amountQar).toBe(71.5)
    expect(e.category).toBe('supplies')
    expect(e.vendor).toBe('Lulu')
    expect(e.reference).toBe('INV-1')
    expect(e.paymentMethod).toBe('Card')
    expect(e.description).toBe('Fresh Milk, Orange, Gloves')
    expect(e.purchase!.lines).toHaveLength(3)
    expect(e.purchase!.lines[0].previousUnitCostQar).toBe(0.006)
  })

  it('treats a line that is not in the inventory as an expense only', () => {
    expect(result.ingredients.map(i => i.id).sort()).toEqual(['milk', 'orange'])
    expect(result.expense.purchase!.lines[2].ingredientId).toBeUndefined()
  })

  it('does not touch the ingredients it was given', () => {
    expect(milk.stockQty).toBe(3000)
    expect(milk.priceHistory).toBeUndefined()
  })
})

describe('undoPurchase', () => {
  it('takes the stock back out and restores the previous price', () => {
    const bought = applyPurchase(input(), [milk, orange])
    const undone = undoPurchase(bought.expense, bought.ingredients)
    const m = undone.ingredients.find(i => i.id === 'milk')!
    expect(m.stockQty).toBe(3000)
    expect(m.unitCostQar).toBe(0.006)
    expect(m.priceHistory).toEqual([])
    expect(undone.adjustments.find(a => a.ingredientId === 'milk')!.delta).toBe(-6000)
  })

  it('leaves a newer purchase price in place', () => {
    const first = applyPurchase(input(), [milk, orange])
    const second = applyPurchase(input({ lines: [{ ingredientId: 'orange', name: 'Orange', qty: 10, totalQar: 10 }] }), first.ingredients)
    const latest = [...first.ingredients.filter(i => i.id !== 'orange'), ...second.ingredients]
    const o = undoPurchase(first.expense, latest).ingredients.find(i => i.id === 'orange')!
    expect(o.unitCostQar).toBe(1)
    expect(o.stockQty).toBe(22)
    expect(o.priceHistory!.map(h => h.expenseId)).toEqual([second.expense.id])
  })
})

describe('purchaseDescription', () => {
  it('names the first three and counts the rest', () => {
    expect(purchaseDescription(['A', 'B', 'C', 'D', 'E'].map(name => ({ name })))).toBe('A, B, C +2 more')
  })
})
