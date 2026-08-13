import { describe, it, expect } from 'vitest'
import { buildBusinessSummaryPdf, detailedSalesRows, STAFF_DISCOUNT_PCT } from './financeExports'
import type { Data } from '../app/useData'
import { buildFinanceSummary, makeExpense, makeWastage, monthRange } from './finance'
import type { Category, Department, Ingredient, MenuItem, Order, Staff } from '../db/schema'

const range = monthRange('2026-01')
const departments: Department[] = [{ id: 'd1', name: 'Audi Service', mainExtension: '', active: true }]
const staff: Staff[] = [{ id: 's1', name: 'Cafe Point', position: '', email: '', extension: '1', departmentId: 'd1', active: true }]
const categories: Category[] = [{ id: 'c1', name: 'Hot Drinks', sortOrder: 1 }]
const ingredients: Ingredient[] = [{ id: 'beans', name: 'Beans', unit: 'g', stockQty: 100, lowStockThreshold: 1, unitCostQar: 0.1 }]
const menuItems: MenuItem[] = [{ id: 'latte', name: 'Latte', categoryId: 'c1', price: 12, active: true, recipe: [{ ingredientId: 'beans', qty: 18 }] }]

const order = (id: string, offsetHours: number, total: number, discountPct?: number): Order => ({
  id, timestamp: range.from + offsetHours * 3600_000, staffId: 's1', departmentId: 'd1',
  total, discountPct, lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 }],
})

const summaryOf = (orders: Order[]) => buildFinanceSummary({
  range,
  orders,
  expenses: [makeExpense({ date: '2026-01-04', category: 'supplies', vendor: 'Metro', description: 'Beans', amountQar: 140.5, paymentMethod: 'Cash' })],
  wastages: [makeWastage({ date: '2026-01-08', itemName: 'Oranges', qty: 4, unit: 'pcs', amountQar: 36.5 })],
  deletionLogs: [],
  departments, staff, categories, menuItems, ingredients,
})

const pdfText = (orders: Order[]) => buildBusinessSummaryPdf(summaryOf(orders)).text()

const data: Data = { priceList: [], departments, staff, categories, menuItems, ingredients }
const round2 = (n: number) => Math.round(n * 100) / 100

describe('detailed sales rows', () => {
  it('carries a discounted price alongside the gross total', () => {
    const [row] = detailedSalesRows([order('a', 1, 12)], data)
    expect(row.totalPrice).toBe(12)
    expect(row.discountedPrice).toBe(10.2) // 12.00 less 15%
  })

  it('discounts the whole line, not the unit price', () => {
    const three: Order = { ...order('a', 1, 36), lines: [{ itemId: 'latte', name: 'Latte', qty: 3, unitPrice: 12 }] }
    const [row] = detailedSalesRows([three], data)
    expect(row.unitPrice).toBe(12)      // untouched
    expect(row.totalPrice).toBe(36)
    expect(row.discountedPrice).toBe(30.6)
  })

  it('rounds the discount to two decimals', () => {
    const odd: Order = { ...order('a', 1, 12.75), lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12.75 }] }
    const [row] = detailedSalesRows([odd], data)
    expect(row.discountedPrice).toBe(10.84) // 10.8375 rounded
  })

  it('applies the same rate to every line, discounted at the till or not', () => {
    const rows = detailedSalesRows([order('plain', 1, 12), order('discounted', 2, 10.2, 15)], data)
    expect(rows).toHaveLength(2)
    for (const r of rows) expect(r.discountedPrice).toBe(round2(r.totalPrice * (1 - STAFF_DISCOUNT_PCT / 100)))
  })

  it('keeps one row per order line', () => {
    const two: Order = {
      ...order('a', 1, 26),
      lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 }, { itemId: 'latte', name: 'Iced Latte', qty: 1, unitPrice: 14 }],
    }
    const rows = detailedSalesRows([two], data)
    expect(rows.map(r => r.discountedPrice)).toEqual([10.2, 11.9])
  })
})

describe('business summary PDF', () => {
  it('produces a well-formed document', async () => {
    const pdf = await pdfText([order('a', 1, 12), order('b', 2, 10.2, 15)])
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).not.toContain('/Parent 0 0 R')
  })

  it('lays out the expected report sections', async () => {
    const pdf = await pdfText([order('a', 1, 12), order('b', 2, 10.2, 15)])
    for (const title of [
      'Business Summary', 'Revenues', 'Order Types', 'Wastage', 'Costs & Profits',
      'Discount', 'Payment Types', 'Voids', 'Sales by Staff', 'Sales by Category',
      'Sales by Tag', 'Department Collections', 'Expenses by Category',
    ]) {
      expect(pdf, `missing section: ${title}`).toContain(`(${title}) Tj`)
    }
  })

  it('shows a genuine deduction in brackets', async () => {
    const pdf = await pdfText([order('a', 1, 12), order('b', 2, 10.2, 15)])
    expect(pdf).toContain('\\(1.80\\)') // discount: 12.00 gross - 10.20 net
  })

  it('presents expenses and wastage as the make-up of COGS, not as deductions', async () => {
    // Bracketing them would read as a second subtraction; they are already
    // inside COGS, so they appear as plain build-up figures.
    const pdf = await pdfText([order('a', 1, 12), order('b', 2, 10.2, 15)])
    expect(pdf).toContain('(140.50) Tj')   // expenses, plain
    expect(pdf).not.toContain('\\(140.50\\)')
    expect(pdf).toContain('(177.00) Tj')   // COGS = 140.50 expenses + 36.50 wastage
  })

  it('carries the period and a page number onto every page', async () => {
    const pdf = await pdfText([order('a', 1, 12)])
    const pageCount = Number(/\/Count (\d+)/.exec(pdf)![1])
    expect(pageCount).toBeGreaterThanOrEqual(1)
    for (let i = 1; i <= pageCount; i++) expect(pdf).toContain(`(${i}/${pageCount}) Tj`)
    expect(pdf).toContain(`(Period: ${range.label}) Tj`)
  })

  it('paginates rather than running off the bottom of one page', async () => {
    // 60 departments force far more sections than a single page can hold.
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `d${i}`, name: `Department ${i}`, mainExtension: '', active: true }))
    const orders = many.map((d, i) => ({ ...order(`o${i}`, i, 12), departmentId: d.id }))
    const summary = buildFinanceSummary({
      range, orders, expenses: [], wastages: [], deletionLogs: [],
      departments: many, staff, categories, menuItems, ingredients,
    })
    const pdf = await buildBusinessSummaryPdf(summary).text()
    expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBeGreaterThan(1)
    // Nothing should be drawn into the footer strip or off the page.
    const ys = [...pdf.matchAll(/BT \/F\d [\d.]+ Tf [\d.-]+ ([\d.-]+) Td/g)].map(m => Number(m[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(30)
    expect(Math.max(...ys)).toBeLessThan(792)
  })

  it('says so when a section has no activity', async () => {
    const bare = buildFinanceSummary({
      range, orders: [order('a', 1, 12)], expenses: [], wastages: [], deletionLogs: [],
      departments, staff, categories, menuItems, ingredients,
    })
    // Wastage has nothing but its total row, so it must explain itself.
    expect(await buildBusinessSummaryPdf(bare).text()).toContain('(No activity in this period) Tj')
  })

  it('splits an over-long section across pages instead of dropping rows', async () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ id: `s${i}`, name: `Barista ${i}`, position: '', email: '', extension: `${i}`, departmentId: 'd1', active: true }))
    const orders = many.map((s, i) => ({ ...order(`o${i}`, i, 12), staffId: s.id }))
    const summary = buildFinanceSummary({
      range, orders, expenses: [], wastages: [], deletionLogs: [],
      departments, staff: many, categories, menuItems, ingredients,
    })
    const pdf = await buildBusinessSummaryPdf(summary).text()
    expect(pdf).toContain('(Sales by Staff \\(continued\\)) Tj')
    // Every one of the 90 staff rows still appears somewhere.
    for (const s of many) expect(pdf, `missing ${s.name}`).toContain(`(${s.name}) Tj`)
  })
})
