import { describe, expect, it } from 'vitest'
import { buildFinanceSummary, calculateCogs, dayRange, makeExpense, makeWastage, monthRange, orderGross, todayKey } from './finance'
import type { Category, DeletionLog, Department, Ingredient, MenuItem, Order, Staff } from '../db/schema'

const range = monthRange('2026-03')
const departments: Department[] = [{ id: 'd1', name: 'Sales', mainExtension: '', active: true }]
const staff: Staff[] = [{ id: 's1', name: 'Aisha', position: '', email: '', extension: '123', departmentId: 'd1', active: true }]
const categories: Category[] = [{ id: 'c1', name: 'Hot Drinks', sortOrder: 1 }]
const ingredients: Ingredient[] = [
  { id: 'beans', name: 'Coffee Beans', unit: 'g', stockQty: 1000, lowStockThreshold: 100, unitCostQar: 0.1 },
  { id: 'milk', name: 'Milk', unit: 'ml', stockQty: 1000, lowStockThreshold: 100, unitCostQar: 0.01 },
]
const menuItems: MenuItem[] = [
  { id: 'latte', name: 'Latte', categoryId: 'c1', price: 12, active: true, recipe: [{ ingredientId: 'beans', qty: 18 }, { ingredientId: 'milk', qty: 200 }] },
]
const orders: Order[] = [
  { id: 'o1', timestamp: range.from + 1000, staffId: 's1', departmentId: 'd1', total: 20, discountPct: 10, lines: [{ itemId: 'latte', name: 'Latte', qty: 2, unitPrice: 11 }] },
  { id: 'o2', timestamp: range.from + 2000, staffId: null, departmentId: null, walkin: true, customerName: 'Walk In', total: 12, lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 }] },
]
const deletionLogs: DeletionLog[] = [{ id: 'del1', timestamp: range.from + 3000, reason: 'test', order: orders[0] }]

describe('finance calculations', () => {
  it('calculates order gross before discounts', () => {
    expect(orderGross(orders[0])).toBe(22)
  })

  it('calculates COGS from recipe quantities and ingredient unit costs', () => {
    expect(calculateCogs(orders, menuItems, ingredients).cogs).toBe(11.4)
  })

  it('builds a monthly finance summary', () => {
    const expenses = [makeExpense({ date: '2026-03-10', category: 'supplies', vendor: 'Vendor', description: 'Beans', amountQar: 5, paymentMethod: 'Cash' })]
    const wastages = [makeWastage({ date: '2026-03-11', itemName: 'Oranges', qty: 3, unit: 'pcs', amountQar: 9, reason: 'expired' })]
    const summary = buildFinanceSummary({ range, orders, expenses, wastages, deletionLogs, departments, staff, categories, menuItems, ingredients })
    expect(summary.grossSales).toBe(34)
    expect(summary.netSales).toBe(32)
    expect(summary.discounts).toBe(2)
    expect(summary.expenseTotal).toBe(5)
    expect(summary.wastageTotal).toBe(9)
    expect(summary.netProfit).toBe(6.6)
    expect(summary.voids.orderVoids).toBe(1)
    expect(summary.orderTypes.map(r => r.name)).toEqual(expect.arrayContaining(['Call Center - Delivery', 'Walk-In']))
    expect(summary.salesByCategory[0].name).toBe('Hot Drinks')
  })

  it('tracks missing costs without fabricating COGS', () => {
    const result = calculateCogs(orders, menuItems, [{ ...ingredients[0], unitCostQar: undefined }, ingredients[1]])
    expect(result.missingCostItems).toContain('Latte')
  })

  it('reports a single day as a whole day', () => {
    const r = dayRange('2026-03-12', '2026-03-12')
    expect(r.key).toBe('2026-03-12')
    expect(r.from).toBe(new Date(2026, 2, 12, 0, 0, 0, 0).getTime())
    expect(r.to).toBe(new Date(2026, 2, 13, 0, 0, 0, 0).getTime())     // exclusive
    expect(r.to - r.from).toBe(24 * 60 * 60 * 1000)
  })

  it('includes the last day in full for a multi-day range', () => {
    const r = dayRange('2026-03-01', '2026-03-03')
    expect(r.key).toBe('2026-03-01_2026-03-03')
    expect(r.to).toBe(new Date(2026, 2, 4, 0, 0, 0, 0).getTime())
    // An order at 23:59 on the last day still counts.
    expect(new Date(2026, 2, 3, 23, 59).getTime()).toBeLessThan(r.to)
  })

  it('swaps a backwards day range instead of returning nothing', () => {
    expect(dayRange('2026-03-10', '2026-03-01')).toMatchObject(dayRange('2026-03-01', '2026-03-10'))
  })

  it('derives todayKey in the format the date input expects', () => {
    expect(todayKey(new Date(2026, 2, 5))).toBe('2026-03-05')
  })

  it('summarises only the orders inside a chosen day', () => {
    // orders[0] is on the 1st of the month at +1s; orders[1] at +2s. Both fall
    // on day one, so a range covering only day two must report nothing.
    const dayOne = new Date(range.from)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const first = buildFinanceSummary({ range: dayRange(iso(dayOne), iso(dayOne)), orders, expenses: [], deletionLogs, departments, staff, categories, menuItems, ingredients })
    expect(first.orders).toHaveLength(2)
    const next = new Date(dayOne); next.setDate(next.getDate() + 1)
    const second = buildFinanceSummary({ range: dayRange(iso(next), iso(next)), orders, expenses: [], deletionLogs, departments, staff, categories, menuItems, ingredients })
    expect(second.orders).toHaveLength(0)
    expect(second.netSales).toBe(0)
  })

  it('costs a tailored line by what it actually used', () => {
    // Menu latte is 18g beans + 200ml milk = 3.80. This line doubles the milk.
    const tailored: Order[] = [{
      ...orders[1],
      lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12, recipe: [{ ingredientId: 'beans', qty: 18 }, { ingredientId: 'milk', qty: 400 }] }],
    }]
    expect(calculateCogs(tailored, menuItems, ingredients).cogs).toBe(5.8) // 1.80 + 4.00
  })

  it('costs an emptied line as unknown rather than free', () => {
    const emptied: Order[] = [{ ...orders[1], lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12, recipe: [] }] }]
    const result = calculateCogs(emptied, menuItems, ingredients)
    expect(result.cogs).toBe(0)
    expect(result.missingCostItems).toContain('Latte')
  })

  it('prices a sub-divided ingredient per stocked unit, not per sub-unit', () => {
    // A lemon costs 2 QAR and yields 10 slices; the mojito uses 4 slices, so
    // 0.8 QAR per drink — not 8 QAR, which is what pricing slices as lemons gives.
    const lemon: Ingredient = {
      id: 'lemon', name: 'Lemon', unit: 'pcs', stockQty: 40, lowStockThreshold: 10,
      unitCostQar: 2, subUnit: 'slices', subUnitPer: 10,
    }
    const mojito: MenuItem = { id: 'mojito', name: 'Mojito', categoryId: 'c1', price: 15, active: true, recipe: [{ ingredientId: 'lemon', qty: 4 }] }
    const sold: Order[] = [{ id: 'o3', timestamp: range.from + 4000, staffId: 's1', departmentId: 'd1', total: 30, lines: [{ itemId: 'mojito', name: 'Mojito', qty: 2, unitPrice: 15 }] }]
    expect(calculateCogs(sold, [mojito], [lemon]).cogs).toBe(1.6)
  })
})
