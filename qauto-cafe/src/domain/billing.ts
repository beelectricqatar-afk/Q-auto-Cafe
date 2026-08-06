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
