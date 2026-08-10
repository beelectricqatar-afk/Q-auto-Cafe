import type { Order, PaymentMethod } from '../db/schema'

/** The ways to pay, in the order the barista sees them. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'card'] as const

const LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
}

/** Display name. Orders placed before this was asked have none. */
export function paymentLabel(method: PaymentMethod | undefined): string {
  return method ? LABELS[method] : ''
}

/**
 * Totals per payment method for reporting. Orders taken before the barista was
 * asked are grouped as Unassigned rather than assumed to be cash — the figure
 * would otherwise assert something never recorded.
 */
export function ordersByPayment(orders: Order[]): { name: string; qty: number; value: number }[] {
  const totals = new Map<string, { name: string; qty: number; value: number }>()
  for (const order of orders) {
    const name = paymentLabel(order.paymentMethod) || 'Unassigned'
    const row = totals.get(name) ?? { name, qty: 0, value: 0 }
    row.qty += 1
    row.value = Math.round((row.value + order.total) * 100) / 100
    totals.set(name, row)
  }
  return [...totals.values()].sort((a, b) => b.value - a.value)
}
