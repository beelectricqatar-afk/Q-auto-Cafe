import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from '../../db/repo'
import { placeOrder } from '../barista/placeOrder'
import { deleteOrder } from './deleteOrder'
import type { FinanceWastage, Ingredient, InventoryAdjustment, MenuItem, Order } from '../../db/schema'

const milk: Ingredient = { id: 'milk', name: 'Milk', unit: 'ml', stockQty: 1000, lowStockThreshold: 100 }
const beans: Ingredient = { id: 'beans', name: 'Beans', unit: 'g', stockQty: 1000, lowStockThreshold: 100 }
// 1 lemon = 10 slices, so restoring has to roll part-used lemons back up.
const lemon: Ingredient = {
  id: 'lemon', name: 'Lemon', unit: 'pcs', stockQty: 40, lowStockThreshold: 10,
  subUnit: 'slices', subUnitPer: 10, openSubQty: 0,
}
const latte: MenuItem = {
  id: 'latte', name: 'Latte', categoryId: 'h', price: 12, active: true,
  recipe: [{ ingredientId: 'milk', qty: 250 }, { ingredientId: 'beans', qty: 18 }],
}
const mojito: MenuItem = { id: 'mojito', name: 'Mojito', categoryId: 'm', price: 15, active: true, recipe: [{ ingredientId: 'lemon', qty: 4 }] }

const stock = async (id: string) => (await repo.get<Ingredient>('ingredients', id))!

beforeEach(async () => {
  await repo.clearAll()
  for (const i of [milk, beans, lemon]) await repo.put('ingredients', { ...i })
  for (const m of [latte, mojito]) await repo.put('menuItems', m)
})

const placeLatte = (qty = 2) =>
  placeOrder({ staffId: 's1', departmentId: 'd1', lines: [{ itemId: 'latte', name: 'Latte', qty, unitPrice: 12 }] })

describe('deleting an order back to inventory', () => {
  it('puts every ingredient back exactly as it was', async () => {
    const { order } = await placeLatte()
    expect((await stock('milk')).stockQty).toBe(500) // 1000 - 250*2

    await deleteOrder({ order, reason: 'rung up twice', disposition: 'restock' })
    expect((await stock('milk')).stockQty).toBe(1000)
    expect((await stock('beans')).stockQty).toBe(1000)
  })

  it('rolls part-used lemons back into whole ones', async () => {
    const { order } = await placeOrder({ staffId: 's1', departmentId: 'd1', lines: [{ itemId: 'mojito', name: 'Mojito', qty: 1, unitPrice: 15 }] })
    expect(await stock('lemon')).toMatchObject({ stockQty: 39, openSubQty: 6 })

    await deleteOrder({ order, reason: 'wrong drink', disposition: 'restock' })
    expect(await stock('lemon')).toMatchObject({ stockQty: 40, openSubQty: 0 })
  })

  it('restores what a tailored line actually used, not the menu recipe', async () => {
    const { order } = await placeOrder({
      staffId: 's1', departmentId: 'd1',
      lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12, recipe: [{ ingredientId: 'milk', qty: 400 }] }],
    })
    expect((await stock('milk')).stockQty).toBe(600)
    await deleteOrder({ order, reason: 'remade', disposition: 'restock' })
    expect((await stock('milk')).stockQty).toBe(1000)
  })

  it('records the return in the stock audit trail', async () => {
    const { order } = await placeLatte(1)
    await deleteOrder({ order, reason: 'cancelled', disposition: 'restock' })
    const returns = (await repo.all<InventoryAdjustment>('inventoryAdjustments')).filter(a => a.reason === 'return')
    expect(returns).toHaveLength(2) // milk and beans
    expect(returns.find(a => a.ingredientId === 'milk')).toMatchObject({ delta: 250, orderId: order.id })
  })

  it('books no wastage', async () => {
    const { order } = await placeLatte()
    await deleteOrder({ order, reason: 'cancelled', disposition: 'restock' })
    expect(await repo.all('financeWastages')).toHaveLength(0)
  })

  it('copes with an ingredient that has since been deleted', async () => {
    const { order } = await placeLatte()
    await repo.remove('ingredients', 'beans')
    await expect(deleteOrder({ order, reason: 'cancelled', disposition: 'restock' })).resolves.toBeTruthy()
    expect((await stock('milk')).stockQty).toBe(1000) // the rest still comes back
  })
})

describe('deleting an order as wastage', () => {
  it('books the order value and leaves stock consumed', async () => {
    const { order } = await placeLatte()
    await deleteOrder({ order, reason: 'customer left', disposition: 'wastage' })

    expect((await stock('milk')).stockQty).toBe(500) // still gone — it was made
    const [w] = await repo.all<FinanceWastage>('financeWastages')
    expect(w.amountQar).toBe(24) // 2 x 12.00
    expect(w.itemName).toContain('Latte')
    expect(w.reason).toContain('customer left')
  })

  it('books the discounted total actually charged', async () => {
    const { order } = await placeOrder({ staffId: 's1', departmentId: 'd1', discountPct: 15, lines: [{ itemId: 'latte', name: 'Latte', qty: 2, unitPrice: 12 }] })
    await deleteOrder({ order, reason: 'spilled', disposition: 'wastage' })
    expect((await repo.all<FinanceWastage>('financeWastages'))[0].amountQar).toBe(20.4)
  })

  it('writes no return adjustments', async () => {
    const { order } = await placeLatte()
    await deleteOrder({ order, reason: 'spilled', disposition: 'wastage' })
    expect((await repo.all<InventoryAdjustment>('inventoryAdjustments')).filter(a => a.reason === 'return')).toHaveLength(0)
  })
})

describe('both dispositions', () => {
  it.each(['restock', 'wastage'] as const)('removes the order and logs it (%s)', async disposition => {
    const { order } = await placeLatte()
    await deleteOrder({ order, reason: 'a good reason', disposition })
    expect(await repo.all<Order>('orders')).toHaveLength(0)
    const [log] = await repo.all<{ reason: string; order: Order }>('deletionLogs')
    expect(log.reason).toBe('a good reason')
    expect(log.order.id).toBe(order.id) // the full order is kept for audit
  })

  it.each(['restock', 'wastage'] as const)('queues the deletion for the cloud (%s)', async disposition => {
    const { order } = await placeLatte()
    await deleteOrder({ order, reason: 'x', disposition })
    const outbox = await repo.outboxAll()
    expect(outbox.find(e => e.store === 'orders' && e.id === order.id)?.op).toBe('del')
    expect(outbox.some(e => e.store === 'deletionLogs' && e.op === 'put')).toBe(true)
  })
})
