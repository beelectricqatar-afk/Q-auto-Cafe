import { getDb } from '../../db/database'
import { computeDeductions, restoreDeduction, subDivision } from '../../domain/deduction'
import { makeWastage } from '../../domain/finance'
import { OUTBOX_STORE, type DeletionLog, type Ingredient, type InventoryAdjustment, type MenuItem, type Order, type Outbox } from '../../db/schema'

/** What happens to the stock an order consumed when that order is deleted. */
export type DeleteDisposition =
  | 'restock'  // the drinks were never made: put the ingredients back
  | 'wastage'  // they were made and thrown away: keep the stock gone, book the loss

export interface DeleteOrderResult {
  /** ingredientId -> amount put back, in that ingredient's recipe unit. */
  restored: Record<string, number>
  /** The value booked as wastage, when that disposition was chosen. */
  wastedQar: number
}

/**
 * Removes an order and settles what it consumed, in a single transaction so the
 * order, its audit log and the stock movement cannot come apart.
 */
export async function deleteOrder(input: {
  order: Order
  reason: string
  disposition: DeleteDisposition
}): Promise<DeleteOrderResult> {
  const { order, reason, disposition } = input
  const db = await getDb()
  const items = (await db.getAll('menuItems')) as MenuItem[]
  // What this order took out of stock, honouring any per-line tailoring.
  const consumed = computeDeductions(order.lines, items)
  const now = Date.now()

  const tx = db.transaction(
    ['orders', 'ingredients', 'inventoryAdjustments', 'deletionLogs', 'financeWastages', OUTBOX_STORE],
    'readwrite',
  )
  const out = tx.objectStore(OUTBOX_STORE)
  const queue = (store: Outbox['store'], id: string, op: 'put' | 'del', record?: unknown) =>
    out.put({ key: `${store}:${id}`, store, id, op, record, updatedAt: now } satisfies Outbox)

  const restored: Record<string, number> = {}
  if (disposition === 'restock') {
    const ingStore = tx.objectStore('ingredients')
    const adjStore = tx.objectStore('inventoryAdjustments')
    for (const [ingredientId, qty] of Object.entries(consumed)) {
      const ing = (await ingStore.get(ingredientId)) as Ingredient | undefined
      if (!ing) continue // ingredient since deleted; nothing to put back
      const { per } = subDivision(ing)
      const before = ing.stockQty
      const next = restoreDeduction(ing, qty)
      ing.stockQty = next.stockQty
      if (per > 1) ing.openSubQty = next.openSubQty
      await ingStore.put(ing)
      await queue('ingredients', ing.id, 'put', ing)
      restored[ingredientId] = qty

      const adj: InventoryAdjustment = {
        id: crypto.randomUUID(), timestamp: now, ingredientId,
        delta: Math.round((next.stockQty - before) * 1000) / 1000,
        reason: 'return', orderId: order.id,
        ...(per > 1 && { subDelta: qty }),
      }
      await adjStore.put(adj)
      await queue('inventoryAdjustments', adj.id, 'put', adj)
    }
  }

  let wastedQar = 0
  if (disposition === 'wastage') {
    // Stock stays consumed; the money is booked as a loss, which feeds COGS.
    wastedQar = order.total
    const summary = order.lines.map(l => `${l.qty}x ${l.name}`).join(', ')
    const wastage = makeWastage({
      date: new Date(order.timestamp).toISOString().slice(0, 10),
      itemName: summary.length > 80 ? `${summary.slice(0, 77)}...` : summary || 'Deleted order',
      amountQar: order.total,
      reason: `Deleted order — ${reason}`,
    })
    await tx.objectStore('financeWastages').put(wastage)
    await queue('financeWastages', wastage.id, 'put', wastage)
  }

  const log: DeletionLog = { id: crypto.randomUUID(), timestamp: now, reason, order }
  await tx.objectStore('deletionLogs').put(log)
  await queue('deletionLogs', log.id, 'put', log)

  await tx.objectStore('orders').delete(order.id)
  await queue('orders', order.id, 'del')

  await tx.done
  return { restored, wastedQar }
}
