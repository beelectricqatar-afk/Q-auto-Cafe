import { getDb } from '../../db/database'
import { applyDeduction, computeDeductions, subDivision } from '../../domain/deduction'
import { ticketTotal, applyDiscount } from '../../domain/money'
import { OUTBOX_STORE, type Order, type OrderLine, type MenuItem, type Ingredient, type InventoryAdjustment, type Outbox } from '../../db/schema'

export interface PlaceOrderInput { staffId: string | null; departmentId: string | null; lines: OrderLine[]; note?: string; walkin?: boolean; customerName?: string; discountPct?: number }

export async function placeOrder(input: PlaceOrderInput): Promise<{ order: Order }> {
  const db = await getDb()
  const items = (await db.getAll('menuItems')) as MenuItem[]
  const deductions = computeDeductions(input.lines, items)
  const order: Order = {
    id: crypto.randomUUID(), timestamp: Date.now(),
    staffId: input.staffId, departmentId: input.departmentId,
    lines: input.lines, total: applyDiscount(ticketTotal(input.lines), input.discountPct ?? 0), note: input.note,
    walkin: input.walkin || (!input.staffId && !input.departmentId),
    customerName: input.customerName?.trim() || undefined,
    discountPct: input.discountPct || undefined,
  }
  const tx = db.transaction(['orders', 'ingredients', 'inventoryAdjustments', OUTBOX_STORE], 'readwrite')
  const out = tx.objectStore(OUTBOX_STORE)
  const queue = (store: Outbox['store'], id: string, record: unknown) =>
    out.put({ key: `${store}:${id}`, store, id, op: 'put', record, updatedAt: order.timestamp } satisfies Outbox)
  await tx.objectStore('orders').put(order)
  await queue('orders', order.id, order)
  const ingStore = tx.objectStore('ingredients')
  const adjStore = tx.objectStore('inventoryAdjustments')
  for (const [ingredientId, qty] of Object.entries(deductions)) {
    const ing = (await ingStore.get(ingredientId)) as Ingredient | undefined
    if (!ing) continue
    // `qty` is in the ingredient's recipe unit — sub-units (e.g. lemon slices)
    // where one is configured, otherwise the stocked unit.
    const { per } = subDivision(ing)
    const before = ing.stockQty
    const next = applyDeduction(ing, qty)
    ing.stockQty = next.stockQty
    if (per > 1) ing.openSubQty = next.openSubQty
    await ingStore.put(ing)
    await queue('ingredients', ing.id, ing)
    // Stock can be unchanged when a sub-divided ingredient was served entirely
    // from the already-opened unit, so `subDelta` carries the real consumption.
    const adj: InventoryAdjustment = {
      id: crypto.randomUUID(), timestamp: order.timestamp, ingredientId,
      delta: Math.round((next.stockQty - before) * 1000) / 1000,
      reason: 'order', orderId: order.id,
      ...(per > 1 && { subDelta: -qty }),
    }
    await adjStore.put(adj)
    await queue('inventoryAdjustments', adj.id, adj)
  }
  await tx.done
  return { order }
}
