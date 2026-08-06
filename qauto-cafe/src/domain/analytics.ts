import type { Order, Department } from '../db/schema'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface ItemStat { name: string; qty: number; revenue: number }
export interface DeptStat { name: string; total: number; orderCount: number }

export function ordersInRange(orders: Order[], from: number, to: number): Order[] {
  return orders.filter(o => o.timestamp >= from && o.timestamp < to)
}

export function revenue(orders: Order[]): number {
  return round2(orders.reduce((s, o) => s + o.total, 0))
}

export function avgOrderValue(orders: Order[]): number {
  return orders.length ? round2(revenue(orders) / orders.length) : 0
}

export function walkinCount(orders: Order[]): number {
  return orders.filter(o => o.walkin).length
}

export function topItems(orders: Order[], limit = 5): ItemStat[] {
  const map = new Map<string, ItemStat>()
  for (const o of orders) for (const l of o.lines) {
    const s = map.get(l.name) ?? { name: l.name, qty: 0, revenue: 0 }
    s.qty += l.qty; s.revenue = round2(s.revenue + l.unitPrice * l.qty)
    map.set(l.name, s)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

export function topDepartments(orders: Order[], departments: Department[], limit = 5): DeptStat[] {
  const name = (id: string | null, walkin?: boolean) =>
    walkin ? 'Walk-in' : (departments.find(d => d.id === id)?.name ?? 'Unassigned')
  const map = new Map<string, DeptStat>()
  for (const o of orders) {
    const n = name(o.departmentId, o.walkin)
    const s = map.get(n) ?? { name: n, total: 0, orderCount: 0 }
    s.total = round2(s.total + o.total); s.orderCount++
    map.set(n, s)
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

// Busiest hour as a label like "2–3 PM", or null when there are no orders.
export function peakHour(orders: Order[]): string | null {
  if (!orders.length) return null
  const counts = new Array(24).fill(0)
  for (const o of orders) counts[new Date(o.timestamp).getHours()]++
  let best = 0
  for (let h = 1; h < 24; h++) if (counts[h] > counts[best]) best = h
  const fmt = (h: number) => { const ampm = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12} ${ampm}` }
  return `${fmt(best)}–${fmt((best + 1) % 24)}`
}
