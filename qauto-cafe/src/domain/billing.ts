import type { Order } from '../db/schema'

export interface PersonTotal { staffId: string | null; total: number; orderCount: number }
export interface DepartmentTotal { departmentId: string | null; total: number; orderCount: number; byPerson: PersonTotal[] }
export interface BillingReport { from: number; to: number; departments: DepartmentTotal[]; grandTotal: number }
export interface DateRange { from: number; to: number } // [from, to)

export function aggregateBilling(orders: Order[], range: DateRange): BillingReport {
  const inRange = orders.filter(o => o.timestamp >= range.from && o.timestamp < range.to)
  const deptMap = new Map<string | null, { total: number; count: number; people: Map<string | null, PersonTotal> }>()
  for (const o of inRange) {
    if (!deptMap.has(o.departmentId)) deptMap.set(o.departmentId, { total: 0, count: 0, people: new Map() })
    const d = deptMap.get(o.departmentId)!
    d.total = Math.round((d.total + o.total) * 100) / 100; d.count++
    const p = d.people.get(o.staffId) ?? { staffId: o.staffId, total: 0, orderCount: 0 }
    p.total = Math.round((p.total + o.total) * 100) / 100; p.orderCount++
    d.people.set(o.staffId, p)
  }
  const departments: DepartmentTotal[] = [...deptMap.entries()].map(([departmentId, d]) => ({
    departmentId, total: d.total, orderCount: d.count,
    byPerson: [...d.people.values()].sort((a, b) => b.total - a.total),
  })).sort((a, b) => b.total - a.total)
  const grandTotal = Math.round(departments.reduce((s, d) => s + d.total, 0) * 100) / 100
  return { from: range.from, to: range.to, departments, grandTotal }
}

export interface WalkinGroup { key: string; name: string; total: number; orderCount: number }

/**
 * Walk-ins per person. One the directory knows (picked at the counter, or
 * matched by mobile online) is counted under that person whatever name was
 * typed; anyone else is grouped by the name as written.
 */
export function walkinKey(o: Order): string {
  return o.walkinStaffId ? `staff:${o.walkinStaffId}` : `name:${o.customerName?.trim() || '(no name)'}`
}

export function walkinGroups(orders: Order[], staffName: (id: string) => string | undefined): WalkinGroup[] {
  const m = new Map<string, WalkinGroup>()
  for (const o of orders) {
    if (!o.walkin) continue
    const key = walkinKey(o)
    const name = (o.walkinStaffId && staffName(o.walkinStaffId)) || o.customerName?.trim() || '(no name)'
    const g = m.get(key) ?? { key, name, total: 0, orderCount: 0 }
    g.total = Math.round((g.total + o.total) * 100) / 100; g.orderCount++
    m.set(key, g)
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}
