import { describe, expect, it } from 'vitest'
import { buildFinanceSummary, dayRange, makeExpense, makeWastage, monthRange, orderGross, profitSplit, todayKey } from './finance'
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

  it('treats COGS as expenses plus wastage', () => {
    const expenses = [makeExpense({ date: '2026-03-10', category: 'supplies', vendor: 'V', description: 'Beans', amountQar: 5, paymentMethod: 'Cash' })]
    const wastages = [makeWastage({ date: '2026-03-11', itemName: 'Oranges', amountQar: 9 })]
    const s = buildFinanceSummary({ range, orders, expenses, wastages, deletionLogs, departments, staff, categories, menuItems, ingredients })
    expect(s.cogs).toBe(14) // 5 + 9
  })

  it('does not deduct expenses or wastage a second time', () => {
    const expenses = [makeExpense({ date: '2026-03-10', category: 'supplies', vendor: 'V', description: 'Beans', amountQar: 5, paymentMethod: 'Cash' })]
    const wastages = [makeWastage({ date: '2026-03-11', itemName: 'Oranges', amountQar: 9 })]
    const s = buildFinanceSummary({ range, orders, expenses, wastages, deletionLogs, departments, staff, categories, menuItems, ingredients })
    expect(s.grossProfit).toBe(18)          // 32 net sales - 14 cogs
    expect(s.netProfit).toBe(s.grossProfit) // nothing left to subtract
  })

  it('ignores ingredient unit costs entirely', () => {
    const priced = ingredients.map(i => ({ ...i, unitCostQar: 99 }))
    const s = buildFinanceSummary({ range, orders, expenses: [], wastages: [], deletionLogs, departments, staff, categories, menuItems, ingredients: priced })
    expect(s.cogs).toBe(0)
  })

  it('reports zero COGS when nothing has been recorded', () => {
    const s = buildFinanceSummary({ range, orders, expenses: [], wastages: [], deletionLogs, departments, staff, categories, menuItems, ingredients })
    expect(s.cogs).toBe(0)
    expect(s.netProfit).toBe(s.netSales) // profit collapses to sales
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
    expect(summary.cogs).toBe(14)
    expect(summary.netProfit).toBe(18) // 32 - 14
    expect(summary.voids.orderVoids).toBe(1)
    expect(summary.orderTypes.map(r => r.name)).toEqual(expect.arrayContaining(['Call Center - Delivery', 'Walk-In']))
    expect(summary.salesByCategory[0].name).toBe('Hot Drinks')
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

})

describe('profitSplit', () => {
  const split = (orders: Order[], netSales: number, cogs: number) => profitSplit({ orders, netSales, cogs })

  const dept = (id: string, total: number): Order =>
    ({ id, timestamp: 1, staffId: 's1', departmentId: 'd1', total, lines: [] })
  const walkin = (id: string, total: number): Order =>
    ({ id, timestamp: 1, staffId: null, departmentId: null, walkin: true, total, lines: [] })

  it('splits net sales by stream when there are no costs', () => {
    expect(split([dept('a', 70), walkin('b', 30)], 100, 0)).toEqual({ departments: 70, walkin: 30 })
  })

  it('shares COGS in proportion to the sales each stream brought in', () => {
    // 70/30 split of sales, so 70/30 of the 50 cost: 35 and 15.
    expect(split([dept('a', 70), walkin('b', 30)], 100, 50)).toEqual({ departments: 35, walkin: 15 })
  })

  it('always adds back up to the total profit', () => {
    for (const [d, w, cogs] of [[70, 30, 50], [1, 2, 3], [123.45, 67.89, 40.2], [0, 100, 25]]) {
      const net = Math.round((d + w) * 100) / 100
      const s = split([dept('a', d), walkin('b', w)], net, cogs)
      expect(Math.round((s.departments + s.walkin) * 100) / 100).toBe(Math.round((net - cogs) * 100) / 100)
    }
  })

  it('puts the whole loss on one stream when only it traded', () => {
    expect(split([dept('a', 100)], 100, 40)).toEqual({ departments: 60, walkin: 0 })
    expect(split([walkin('a', 100)], 100, 40)).toEqual({ departments: 0, walkin: 60 })
  })

  it('goes negative when costs exceed sales', () => {
    expect(split([dept('a', 50), walkin('b', 50)], 100, 200)).toEqual({ departments: -50, walkin: -50 })
  })

  it('is zero for a period with no sales', () => {
    expect(split([], 0, 80)).toEqual({ departments: 0, walkin: 0 })
  })
})
