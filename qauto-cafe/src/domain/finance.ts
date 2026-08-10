import type { Category, DeletionLog, Department, FinanceExpense, FinanceWastage, Ingredient, MenuItem, Order, Staff } from '../db/schema'
import { ordersByPayment } from './payment'

const round2 = (n: number) => Math.round(n * 100) / 100

export const EXPENSE_CATEGORIES = [
  'supplies',
  'utilities',
  'maintenance',
  'packaging',
  'petty-cash',
  'salaries',
  'rent',
  'other',
] as const

export const EXPENSE_CATEGORY_LABELS: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  supplies: 'Supplies',
  utilities: 'Utilities',
  maintenance: 'Maintenance',
  packaging: 'Packaging',
  'petty-cash': 'Petty cash',
  salaries: 'Salaries',
  rent: 'Rent',
  other: 'Other',
}

/** A reporting window, `[from, to)`. `key` is safe to use in export filenames. */
export interface FinanceRange { key: string; label: string; from: number; to: number }

export interface FinanceSummary {
  range: FinanceRange
  orders: Order[]
  expenses: FinanceExpense[]
  wastages: FinanceWastage[]
  grossSales: number
  discounts: number
  netSales: number
  /** Expenses plus wastage — everything the cafe spent in the period. */
  cogs: number
  grossProfit: number
  expenseTotal: number
  wastageTotal: number
  netProfit: number
  orderTypes: { name: string; orderCount: number; pct: number; value: number }[]
  paymentTypes: { name: string; qty: number; value: number }[]
  salesByStaff: { name: string; qty: number; pct: number; value: number }[]
  salesByCategory: { name: string; qty: number; pctQty: number; value: number; pctValue: number }[]
  salesByTag: { name: string; qty: number; pctQty: number; value: number; pctValue: number }[]
  departmentCollections: { name: string; qty: number; pct: number; value: number }[]
  expensesByCategory: { name: string; value: number }[]
  voids: { itemVoids: number; orderVoids: number; value: number }
}

export function monthRange(monthKey: string): FinanceRange {
  const [year, month] = monthKey.split('-').map(Number)
  const fromDate = new Date(year, month - 1, 1)
  const toDate = new Date(year, month, 1)
  const label = fromDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  return { key: monthKey, label, from: fromDate.getTime(), to: toDate.getTime() }
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * A window covering whole days from `fromISO` to `toISO` inclusive (both
 * `YYYY-MM-DD`). Reversed inputs are swapped, so dragging the pickers the wrong
 * way round still reports something sensible.
 */
export function dayRange(fromISO: string, toISO: string): FinanceRange {
  const [a, b] = fromISO <= toISO ? [fromISO, toISO] : [toISO, fromISO] // ISO dates sort lexically
  const fromDate = new Date(`${a}T00:00:00`)
  const toDate = new Date(`${b}T00:00:00`)
  const end = new Date(toDate)
  end.setDate(end.getDate() + 1) // exclusive: through the end of the last day
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return {
    key: a === b ? a : `${a}_${b}`,
    label: a === b ? day(fromDate) : `${day(fromDate)} - ${day(toDate)}`,
    from: fromDate.getTime(),
    to: end.getTime(),
  }
}

export function orderGross(o: Order): number {
  return round2(o.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))
}

function inRange(timestamp: number, range: FinanceRange): boolean {
  return timestamp >= range.from && timestamp < range.to
}

function orderType(o: Order): string {
  return o.walkin ? 'Walk-In' : 'Call Center - Delivery'
}

function tagForCategory(categoryName: string): string {
  return /pastr|protein|food/i.test(categoryName) ? 'Food' : 'Drinks'
}


function pct(value: number, total: number): number {
  return total ? round2((value / total) * 100) : 0
}

export function buildFinanceSummary(input: {
  range: FinanceRange
  orders: Order[]
  expenses: FinanceExpense[]
  wastages?: FinanceWastage[]
  deletionLogs: DeletionLog[]
  departments: Department[]
  staff: Staff[]
  categories: Category[]
  menuItems: MenuItem[]
  ingredients: Ingredient[]
}): FinanceSummary {
  const range = input.range
  const orders = input.orders.filter(o => inRange(o.timestamp, range))
  const expenses = input.expenses.filter(e => inRange(e.timestamp, range))
  const wastages = (input.wastages ?? []).filter(w => inRange(w.timestamp, range))
  const grossSales = round2(orders.reduce((sum, order) => sum + orderGross(order), 0))
  const netSales = round2(orders.reduce((sum, order) => sum + order.total, 0))
  const discounts = round2(grossSales - netSales)
  const expenseTotal = round2(expenses.reduce((sum, e) => sum + e.amountQar, 0))
  const wastageTotal = round2(wastages.reduce((sum, w) => sum + (w.amountQar ?? 0), 0))
  // Cost of sales is what the cafe actually spent: everything bought, plus
  // everything thrown away. Both are already counted here, so nothing further
  // is deducted below — net profit equals gross profit rather than taking the
  // same two figures off a second time.
  const cogs = round2(expenseTotal + wastageTotal)
  const grossProfit = round2(netSales - cogs)
  const netProfit = grossProfit
  const deptName = (id: string | null, walkin?: boolean) =>
    walkin ? 'Walk-In' : (input.departments.find(d => d.id === id)?.name ?? 'Unassigned')
  const staffName = (id: string | null, walkin?: boolean) =>
    walkin ? 'Walk-In' : (input.staff.find(s => s.id === id)?.name ?? 'Q Cafe POS')
  const categoryName = (itemId: string) => {
    const item = input.menuItems.find(i => i.id === itemId)
    return input.categories.find(c => c.id === item?.categoryId)?.name ?? 'Uncategorized'
  }

  const orderTypeMap = new Map<string, { name: string; orderCount: number; value: number }>()
  const staffMap = new Map<string, { name: string; qty: number; value: number }>()
  const deptMap = new Map<string, { name: string; qty: number; value: number }>()
  const categoryMap = new Map<string, { name: string; qty: number; value: number }>()
  const tagMap = new Map<string, { name: string; qty: number; value: number }>()
  const expenseMap = new Map<string, { name: string; value: number }>()

  for (const order of orders) {
    const ot = orderType(order)
    const orderTypeRow = orderTypeMap.get(ot) ?? { name: ot, orderCount: 0, value: 0 }
    orderTypeRow.orderCount += 1; orderTypeRow.value = round2(orderTypeRow.value + order.total)
    orderTypeMap.set(ot, orderTypeRow)

    const sn = staffName(order.staffId, order.walkin)
    const staffRow = staffMap.get(sn) ?? { name: sn, qty: 0, value: 0 }
    staffRow.qty += 1; staffRow.value = round2(staffRow.value + order.total)
    staffMap.set(sn, staffRow)

    const dn = deptName(order.departmentId, order.walkin)
    const deptRow = deptMap.get(dn) ?? { name: dn, qty: 0, value: 0 }
    deptRow.qty += 1; deptRow.value = round2(deptRow.value + order.total)
    deptMap.set(dn, deptRow)

    for (const line of order.lines) {
      const cat = categoryName(line.itemId)
      const catRow = categoryMap.get(cat) ?? { name: cat, qty: 0, value: 0 }
      catRow.qty += line.qty; catRow.value = round2(catRow.value + line.qty * line.unitPrice)
      categoryMap.set(cat, catRow)
      const tag = tagForCategory(cat)
      const tagRow = tagMap.get(tag) ?? { name: tag, qty: 0, value: 0 }
      tagRow.qty += line.qty; tagRow.value = round2(tagRow.value + line.qty * line.unitPrice)
      tagMap.set(tag, tagRow)
    }
  }

  for (const e of expenses) {
    const label = EXPENSE_CATEGORY_LABELS[e.category] ?? EXPENSE_CATEGORY_LABELS.other
    const row = expenseMap.get(label) ?? { name: label, value: 0 }
    row.value = round2(row.value + e.amountQar)
    expenseMap.set(label, row)
  }

  const lineQtyTotal = [...categoryMap.values()].reduce((sum, r) => sum + r.qty, 0)
  const categoryValueTotal = [...categoryMap.values()].reduce((sum, r) => sum + r.value, 0)
  const orderCount = orders.length
  const deletedInRange = input.deletionLogs.filter(d => inRange(d.timestamp, range))

  return {
    range,
    orders,
    expenses,
    wastages,
    grossSales,
    discounts,
    netSales,
    cogs,
    grossProfit,
    expenseTotal,
    wastageTotal,
    netProfit,
    orderTypes: [...orderTypeMap.values()].map(r => ({ ...r, pct: pct(r.orderCount, orderCount) })).sort((a, b) => b.value - a.value),
    // Real breakdown now the till asks. Orders taken before it did are grouped
    // as Unassigned rather than assumed to be cash.
    paymentTypes: ordersByPayment(orders),
    salesByStaff: [...staffMap.values()].map(r => ({ ...r, pct: pct(r.qty, orderCount) })).sort((a, b) => b.value - a.value),
    salesByCategory: [...categoryMap.values()].map(r => ({ ...r, pctQty: pct(r.qty, lineQtyTotal), pctValue: pct(r.value, categoryValueTotal) })).sort((a, b) => b.value - a.value),
    salesByTag: [...tagMap.values()].map(r => ({ ...r, pctQty: pct(r.qty, lineQtyTotal), pctValue: pct(r.value, categoryValueTotal) })).sort((a, b) => b.value - a.value),
    departmentCollections: [...deptMap.values()].map(r => ({ ...r, pct: pct(r.qty, orderCount) })).sort((a, b) => b.value - a.value),
    expensesByCategory: [...expenseMap.values()].sort((a, b) => b.value - a.value),
    voids: { itemVoids: 0, orderVoids: deletedInRange.length, value: round2(deletedInRange.reduce((sum, d) => sum + d.order.total, 0)) },
  }
}

/**
 * Profit split between department trade and walk-ins.
 *
 * Net sales divide cleanly — every order is one or the other. COGS does not:
 * expenses and wastage are whole-business costs with no per-order attribution,
 * so each stream carries a share proportional to the sales it brought in. The
 * two figures therefore always add back up to the total profit.
 */
export function profitSplit(summary: Pick<FinanceSummary, 'orders' | 'netSales' | 'cogs'>): { departments: number; walkin: number } {
  const walkinSales = round2(summary.orders.filter(o => o.walkin).reduce((sum, o) => sum + o.total, 0))
  const deptSales = round2(summary.netSales - walkinSales)
  if (!summary.netSales) return { departments: 0, walkin: 0 }
  const walkinCogs = round2(summary.cogs * (walkinSales / summary.netSales))
  return {
    departments: round2(deptSales - (summary.cogs - walkinCogs)),
    walkin: round2(walkinSales - walkinCogs),
  }
}

export function makeExpense(input: Omit<FinanceExpense, 'id' | 'timestamp' | 'source' | 'createdAt' | 'updatedAt'> & { id?: string; source?: FinanceExpense['source'] }): FinanceExpense {
  const date = input.date || new Date().toISOString().slice(0, 10)
  const now = Date.now()
  return {
    ...input,
    id: input.id || crypto.randomUUID(),
    date,
    timestamp: new Date(`${date}T12:00:00`).getTime(),
    amountQar: round2(Number(input.amountQar) || 0),
    source: input.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
  }
}

export function makeWastage(input: Omit<FinanceWastage, 'id' | 'timestamp' | 'createdAt' | 'updatedAt'> & { id?: string }): FinanceWastage {
  const date = input.date || new Date().toISOString().slice(0, 10)
  const now = Date.now()
  const qty = input.qty == null ? undefined : Number(input.qty)
  const amountQar = input.amountQar == null ? undefined : round2(Number(input.amountQar) || 0)
  return {
    ...input,
    id: input.id || crypto.randomUUID(),
    date,
    timestamp: new Date(`${date}T12:00:00`).getTime(),
    qty: qty && Number.isFinite(qty) ? qty : undefined,
    amountQar: amountQar && amountQar > 0 ? amountQar : undefined,
    createdAt: now,
    updatedAt: now,
  }
}
