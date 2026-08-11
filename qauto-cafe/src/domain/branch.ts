import type { Branch, Order } from '../db/schema'

/** The two cafes, in the order the barista sees them. */
export const BRANCHES: readonly Branch[] = ['audi', 'volkswagen'] as const

const LABELS: Record<Branch, string> = {
  audi: 'Audi',
  volkswagen: 'Volkswagen',
}

/** Display name for a branch. Orders placed before branches existed have none. */
export function branchLabel(branch: Branch | undefined): string {
  return branch ? LABELS[branch] : ''
}

// Baristas name the branch in their own words — "Audi Cafe", "Vw Cafe", "VW".
// Whole words only, so "audit" is not a branch.
const MENTIONS: [Branch, RegExp][] = [
  ['audi', /\baudi\b/i],
  ['volkswagen', /\b(volkswagen|vw)\b/i],
]

/** The branch a line of free text names, if it names one at all. */
export function branchFromText(text: string): Branch | undefined {
  return MENTIONS.find(([, pattern]) => pattern.test(text))?.[0]
}

/** Groups orders by branch for reporting, keeping untagged ones visible. */
export function ordersByBranch(orders: Order[]): { name: string; orderCount: number; value: number }[] {
  const totals = new Map<string, { name: string; orderCount: number; value: number }>()
  for (const order of orders) {
    const name = branchLabel(order.branch) || 'Unassigned'
    const row = totals.get(name) ?? { name, orderCount: 0, value: 0 }
    row.orderCount += 1
    row.value = Math.round((row.value + order.total) * 100) / 100
    totals.set(name, row)
  }
  return [...totals.values()].sort((a, b) => b.value - a.value)
}
