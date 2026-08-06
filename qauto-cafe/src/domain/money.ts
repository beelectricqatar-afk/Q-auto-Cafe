import type { OrderLine } from '../db/schema'

export function formatQar(n: number): string { return `QAR ${n.toFixed(2)}` }
export function ticketTotal(lines: OrderLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) * 100) / 100
}
/** Apply a percentage discount to a subtotal, rounded to 2 decimals. */
export function applyDiscount(subtotal: number, pct: number): number {
  return Math.round(subtotal * (1 - pct / 100) * 100) / 100
}
