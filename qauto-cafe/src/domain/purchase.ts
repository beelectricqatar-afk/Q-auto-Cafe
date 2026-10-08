import type { FinanceExpense, Ingredient, InventoryAdjustment, PurchaseLine, Unit } from '../db/schema'
import { makeExpense } from './finance'

export type PaidBy = 'Cash' | 'Card'

/**
 * A bigger unit a quantity can be typed in, and how many stock units one is.
 *
 * Milk is stocked in ml and sugar in g because recipes use them, but nobody
 * buys "6000 ml" — the receipt says 6 L. Only the exact metric pairs are here;
 * anything else is bought in the unit it is stocked in.
 */
export const BULK_UNIT: Partial<Record<Unit, { unit: Unit; factor: number }>> = {
  ml: { unit: 'L', factor: 1000 },
  g: { unit: 'kg', factor: 1000 },
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/** Price per stock unit. Small units cost fractions of a dirham, so keep 4 places. */
export const unitPrice = (line: Pick<PurchaseLine, 'qty' | 'totalQar'>): number =>
  line.qty > 0 ? round(line.totalQar / line.qty, 4) : 0

/** "0.90", "12.50", or "0.0065" for a price per ml — never rounded to 0.00. */
export function formatUnitPrice(n: number): string {
  if (n >= 0.1 || n === 0) return n.toFixed(2)
  return String(Number(n.toPrecision(2)))
}

/** Change from the last price in percent, rounded; null when there is nothing to compare. */
export function priceChangePct(now: number, before: number | undefined): number | null {
  if (before == null || before <= 0) return null
  return Math.round(((now - before) / before) * 100)
}

/** "Fresh Milk, Sugar, Orange +2 more" — what the expense row reads as. */
export function purchaseDescription(lines: Pick<PurchaseLine, 'name'>[]): string {
  const names = lines.map(l => l.name)
  return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '')
}

export interface PurchaseInput {
  date: string
  vendor: string
  receiptNumber: string
  paidBy: PaidBy
  lines: PurchaseLine[]
  receiptFileId?: string
}

export interface PurchaseResult {
  expense: FinanceExpense
  /** The ingredients whose stock and price moved, as they are now. */
  ingredients: Ingredient[]
  adjustments: InventoryAdjustment[]
}

/**
 * Everything one purchase receipt changes, worked out without writing anything.
 *
 * Stock goes up by what was bought; each item's cost becomes what was paid this
 * time (prices move constantly, so the latest receipt is the truth) with the
 * old price kept in its history; and one expense is raised for the receipt
 * total, so Finance and COGS see it exactly as if it had been typed in by hand.
 */
export function applyPurchase(input: PurchaseInput, ingredients: Ingredient[], now = Date.now()): PurchaseResult {
  const byId = new Map(ingredients.map(i => [i.id, i]))
  const changed = new Map<string, Ingredient>()
  const adjustments: InventoryAdjustment[] = []
  const expenseId = crypto.randomUUID()

  const lines = input.lines.map(line => {
    const current = line.ingredientId && (changed.get(line.ingredientId) ?? byId.get(line.ingredientId))
    if (!current) return { ...line, ingredientId: undefined }
    const price = unitPrice(line)
    changed.set(current.id, {
      ...current,
      stockQty: round(current.stockQty + line.qty, 3),
      unitCostQar: price,
      priceHistory: [...(current.priceHistory ?? []), { date: input.date, priceQar: price, vendor: input.vendor || undefined, expenseId }],
    })
    adjustments.push({ id: crypto.randomUUID(), timestamp: now, ingredientId: current.id, delta: line.qty, reason: 'restock' })
    return { ...line, unit: current.unit, previousUnitCostQar: current.unitCostQar }
  })

  const expense = makeExpense({
    id: expenseId,
    date: input.date,
    category: 'supplies',
    vendor: input.vendor.trim(),
    description: purchaseDescription(lines),
    amountQar: lines.reduce((sum, l) => sum + l.totalQar, 0),
    paymentMethod: input.paidBy,
    reference: input.receiptNumber.trim() || undefined,
    purchase: { lines, ...(input.receiptFileId && { receiptFileId: input.receiptFileId }) },
  })
  return { expense, ingredients: [...changed.values()], adjustments }
}

/**
 * Takes a purchase back out: the stock it added, and the price it set.
 *
 * The price only goes back if this purchase is still the latest one for that
 * item — if a newer receipt has since set the price, that one stands.
 */
export function undoPurchase(expense: FinanceExpense, ingredients: Ingredient[], now = Date.now()): Omit<PurchaseResult, 'expense'> {
  const byId = new Map(ingredients.map(i => [i.id, i]))
  const changed = new Map<string, Ingredient>()
  const adjustments: InventoryAdjustment[] = []

  for (const line of expense.purchase?.lines ?? []) {
    const current = line.ingredientId && (changed.get(line.ingredientId) ?? byId.get(line.ingredientId))
    if (!current) continue
    const history = current.priceHistory ?? []
    const wasLatest = history.at(-1)?.expenseId === expense.id
    changed.set(current.id, {
      ...current,
      stockQty: round(current.stockQty - line.qty, 3),
      priceHistory: history.filter(h => h.expenseId !== expense.id),
      ...(wasLatest && { unitCostQar: line.previousUnitCostQar }),
    })
    adjustments.push({ id: crypto.randomUUID(), timestamp: now, ingredientId: current.id, delta: -line.qty, reason: 'manual' })
  }
  return { ingredients: [...changed.values()], adjustments }
}
