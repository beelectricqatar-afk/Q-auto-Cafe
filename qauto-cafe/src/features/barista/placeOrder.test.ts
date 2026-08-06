import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from '../../db/repo'
import { placeOrder } from './placeOrder'
import type { MenuItem, Ingredient } from '../../db/schema'

const milk: Ingredient = { id: 'milk', name: 'Milk', unit: 'ml', stockQty: 500, lowStockThreshold: 100 }
const latte: MenuItem = { id: 'latte', name: 'Latte', categoryId: 'h', price: 12, active: true, recipe: [{ ingredientId: 'milk', qty: 250 }] }

beforeEach(async () => {
  await repo.clearAll()
  await repo.put('ingredients', { ...milk })
  await repo.put('menuItems', latte)
})

describe('placeOrder', () => {
  it('writes the order, deducts inventory, and records adjustments', async () => {
    const { order } = await placeOrder({
      staffId: 's1', departmentId: 'd1',
      lines: [{ itemId: 'latte', name: 'Latte', qty: 2, unitPrice: 12 }],
    })
    expect(order.total).toBe(24)
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(0) // 500 - 250*2
    const adj = await repo.all('inventoryAdjustments')
    expect(adj).toHaveLength(1)
    expect(adj[0]).toMatchObject({ ingredientId: 'milk', delta: -500, reason: 'order', orderId: order.id })
  })
  it('allows negative stock but still records the order', async () => {
    await placeOrder({ staffId: null, departmentId: null, lines: [{ itemId: 'latte', name: 'Latte', qty: 3, unitPrice: 12 }] })
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(-250) // 500 - 750
    expect(await repo.all('orders')).toHaveLength(1)
  })
  it('marks an order with no staff or department as a walk-in', async () => {
    const { order } = await placeOrder({ staffId: null, departmentId: null, walkin: true, lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 }] })
    expect(order.walkin).toBe(true)
    expect(order.staffId).toBeNull()
    expect(order.departmentId).toBeNull()
  })
  it('does not mark a department order as a walk-in', async () => {
    const { order } = await placeOrder({ staffId: null, departmentId: 'd1', lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 }] })
    expect(order.walkin).toBe(false)
  })
  it('applies a 15% discount to the total', async () => {
    const { order } = await placeOrder({ staffId: 's1', departmentId: 'd1', discountPct: 15, lines: [{ itemId: 'latte', name: 'Latte', qty: 2, unitPrice: 12 }] })
    expect(order.total).toBe(20.4) // 24 - 15%
    expect(order.discountPct).toBe(15)
  })
})

// 1 lemon = 10 slices; the mojito recipe is written in slices.
const lemon: Ingredient = {
  id: 'lemon', name: 'Lemon', unit: 'pcs', stockQty: 40, lowStockThreshold: 10,
  subUnit: 'slices', subUnitPer: 10, openSubQty: 0,
}
const mojito: MenuItem = { id: 'mojito', name: 'Mojito', categoryId: 'm', price: 15, active: true, recipe: [{ ingredientId: 'lemon', qty: 4 }] }
const orderMojitos = (qty: number) =>
  placeOrder({ staffId: 's1', departmentId: 'd1', lines: [{ itemId: 'mojito', name: 'Mojito', qty, unitPrice: 15 }] })

describe('placeOrder with a sub-divided ingredient', () => {
  beforeEach(async () => {
    await repo.put('ingredients', { ...lemon })
    await repo.put('menuItems', mojito)
  })

  it('cuts one lemon for 4 slices and carries the remaining 6', async () => {
    await orderMojitos(1)
    expect(await repo.get('ingredients', 'lemon')).toMatchObject({ stockQty: 39, openSubQty: 6 })
  })

  it('serves the next order from the opened lemon without cutting another', async () => {
    await orderMojitos(1)
    await orderMojitos(1)
    expect(await repo.get('ingredients', 'lemon')).toMatchObject({ stockQty: 39, openSubQty: 2 })
    await orderMojitos(1)
    expect(await repo.get('ingredients', 'lemon')).toMatchObject({ stockQty: 38, openSubQty: 8 })
  })

  it('records the whole-lemon delta and the slices actually used', async () => {
    const { order } = await orderMojitos(1)
    const [first] = await repo.all('inventoryAdjustments')
    expect(first).toMatchObject({ ingredientId: 'lemon', delta: -1, subDelta: -4, reason: 'order', orderId: order.id })

    // Second order takes only from the open lemon: no stock movement, 4 slices used.
    await orderMojitos(1)
    const second = (await repo.all('inventoryAdjustments')).find(a => a.id !== first.id)
    expect(second).toMatchObject({ ingredientId: 'lemon', delta: 0, subDelta: -4 })
  })

  it('cuts enough lemons for a multi-drink order', async () => {
    await orderMojitos(3) // 12 slices
    expect(await repo.get('ingredients', 'lemon')).toMatchObject({ stockQty: 38, openSubQty: 8 })
  })

  it('leaves ingredients without a sub-unit untouched by the new path', async () => {
    await orderMojitos(1)
    const adj = (await repo.all('inventoryAdjustments')).find(a => a.ingredientId === 'lemon')
    expect(adj).toBeDefined()
    await placeOrder({ staffId: 's1', departmentId: 'd1', lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 }] })
    const milkRow = await repo.get('ingredients', 'milk')
    expect(milkRow).toMatchObject({ stockQty: 250 })
    expect(milkRow.openSubQty).toBeUndefined()
    const milkAdj = (await repo.all('inventoryAdjustments')).find(a => a.ingredientId === 'milk')
    expect(milkAdj).toMatchObject({ delta: -250 })
    expect(milkAdj.subDelta).toBeUndefined()
  })
})

describe('placeOrder with a line tailored for one customer', () => {
  it('deducts by the line\'s own recipe, not the menu one', async () => {
    await repo.put('ingredients', { id: 'syrup', name: 'Syrup', unit: 'ml', stockQty: 500, lowStockThreshold: 50 })
    await placeOrder({
      staffId: 's1', departmentId: 'd1',
      lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12, recipe: [{ ingredientId: 'milk', qty: 400 }, { ingredientId: 'syrup', qty: 20 }] }],
    })
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(100)  // 500 - 400, not 250
    expect((await repo.get('ingredients', 'syrup'))!.stockQty).toBe(480)
  })

  it('stores the tailoring on the order so it can be costed later', async () => {
    const recipe = [{ ingredientId: 'milk', qty: 400 }]
    const { order } = await placeOrder({ staffId: 's1', departmentId: 'd1', lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12, recipe }] })
    expect((await repo.get('orders', order.id)).lines[0].recipe).toEqual(recipe)
  })

  it('leaves an untailored line following the menu recipe', async () => {
    const { order } = await placeOrder({ staffId: 's1', departmentId: 'd1', lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 }] })
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(250) // 500 - 250
    expect((await repo.get('orders', order.id)).lines[0].recipe).toBeUndefined()
  })

  it('deducts nothing for a line stripped of ingredients', async () => {
    await placeOrder({ staffId: 's1', departmentId: 'd1', lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12, recipe: [] }] })
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(500) // untouched
    expect(await repo.all('inventoryAdjustments')).toHaveLength(0)
  })

  it('keeps two lines of the same item on their own recipes', async () => {
    await placeOrder({
      staffId: 's1', departmentId: 'd1',
      lines: [
        { itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12 },
        { itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 12, recipe: [{ ingredientId: 'milk', qty: 100 }] },
      ],
    })
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(150) // 500 - 250 - 100
  })
})
