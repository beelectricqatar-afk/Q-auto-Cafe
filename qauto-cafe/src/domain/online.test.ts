import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from '../db/repo'
import { placeOrder } from '../features/barista/placeOrder'
import type { Ingredient, InventoryAdjustment, MenuItem, Order, Staff } from '../db/schema'
import { hostByExtension, staffByMobile, staffOnExtension, toPlaceOrderInput, totalWith, columnOf, type OnlineOrder } from './online'
import { milkPair } from './milk'
import { buildFinanceSummary } from './finance'
import { aggregateBilling, walkinGroups } from './billing'

const staff: Staff[] = [
  { id: 'huda', name: 'Huda Abbas', position: '', email: '', extension: '44455 (242)', departmentId: 'mkt', active: true, mobile: '55449915' },
  { id: 'sara', name: 'Sara Ahmed', position: '', email: '', extension: '44452 (302)', departmentId: 'hr', active: true },
  { id: 'priya', name: 'Priya Nair', position: '', email: '', extension: '44455 (241)', departmentId: 'rent', active: true },
  { id: 'yousef', name: 'Yousef Al-Kuwari', position: '', email: '', extension: '44455 (241)', departmentId: 'sawa', active: true },
  { id: 'left', name: 'Gone Person', position: '', email: '', extension: '44452 (390)', departmentId: 'hr', active: false, mobile: '70000000' },
  { id: 'na', name: 'No Ext', position: '', email: '', extension: 'N/A', departmentId: 'hr', active: true },
]

const fresh: Ingredient = { id: 'fresh', name: 'Fresh Milk', unit: 'ml', stockQty: 5000, lowStockThreshold: 0 }
const lf: Ingredient = { id: 'lf', name: 'Lactose Free Milk', unit: 'ml', stockQty: 5000, lowStockThreshold: 0 }
const beans: Ingredient = { id: 'beans', name: 'Coffee Beans', unit: 'g', stockQty: 1000, lowStockThreshold: 0 }
const cappuccino: MenuItem = { id: 'cap', name: 'Cappuccino', categoryId: 'hot', price: 12, active: true, recipe: [{ ingredientId: 'fresh', qty: 180 }, { ingredientId: 'beans', qty: 18 }] }
const americano: MenuItem = { id: 'ame', name: 'Americano', categoryId: 'hot', price: 10, active: true, recipe: [{ ingredientId: 'beans', qty: 18 }] }
const menu = [cappuccino, americano]
const milk = milkPair([fresh, lf, beans])

const online = (data: Partial<OnlineOrder['data']>, status: OnlineOrder['status'] = 'pending'): OnlineOrder => ({
  id: 'on1', status, createdAt: 0, updatedAt: 0,
  data: {
    no: 7, branch: 'audi', who: 'retail', name: 'huda', mobile: '55449915', pay: 'card', deliverTo: 'Desk 4',
    lines: [{ itemId: 'cap', name: 'Cappuccino', qty: 3, unitPrice: 12, milk: 'lactose-free' }, { itemId: 'ame', name: 'Americano', qty: 1, unitPrice: 10 }],
    subtotal: 46, discountPct: 15, total: 39.1,
    ...data,
  },
})

describe('matching the directory', () => {
  it('finds a host by the extension in brackets, or the whole number', () => {
    expect(hostByExtension('302', staff)?.id).toBe('sara')
    expect(hostByExtension('(302)', staff)?.id).toBe('sara')
    expect(hostByExtension('44452302', staff)?.id).toBe('sara')
  })
  it('leaves a shared, unknown or blank extension for the team', () => {
    expect(staffOnExtension('241', staff).map(s => s.id)).toEqual(['priya', 'yousef'])
    expect(hostByExtension('241', staff)).toBeNull()
    expect(hostByExtension('999', staff)).toBeNull()
    expect(hostByExtension('', staff)).toBeNull()
  })
  it('does not match someone who has left', () => {
    expect(hostByExtension('390', staff)).toBeNull()
    expect(staffByMobile('70000000', staff)).toBeNull()
  })
  it('finds a retail customer by an 8-digit mobile, however it was typed', () => {
    expect(staffByMobile('5544 9915', staff)?.id).toBe('huda')
    expect(staffByMobile('+974 55449915'.slice(5), staff)?.id).toBe('huda')
    expect(staffByMobile('5544991', staff)).toBeNull()
  })
})

describe('turning an online order into a POS order', () => {
  const opts = { host: null, staff, menuItems: menu, milk, discountPct: 15 }

  it('keeps Staff (retail) a walk-in, saved under the matched person', () => {
    const input = toPlaceOrderInput(online({}), opts)
    expect(input).toMatchObject({
      staffId: null, departmentId: null, walkin: true, customerName: 'Huda Abbas', walkinStaffId: 'huda',
      paymentMethod: 'card', discountPct: 15, branch: 'audi', onlineOrderId: 'on1',
    })
  })
  it('saves an unmatched mobile under the name they typed, with no link', () => {
    const input = toPlaceOrderInput(online({ mobile: '33333333', name: 'Visitor Joe' }), opts)
    expect(input.customerName).toBe('Visitor Joe')
    expect(input.walkinStaffId).toBeUndefined()
    expect(input.walkin).toBe(true)
  })
  it('bills a guest to the host department', () => {
    const host = staff.find(s => s.id === 'sara')!
    const input = toPlaceOrderInput(online({ who: 'guest', ext: '302', mobile: undefined, pay: undefined, name: 'Mr Smith', discountPct: 0 }), { ...opts, host, discountPct: 0 })
    expect(input).toMatchObject({ staffId: 'sara', departmentId: 'hr', discountPct: 0 })
    expect(input.walkin).toBeUndefined()
    expect(input.note).toContain('Guest: Mr Smith')
  })
  it('will not place a guest order until the host is known', () => {
    expect(() => toPlaceOrderInput(online({ who: 'guest', ext: '241' }), opts)).toThrow(/visiting/)
  })
  it('pours lactose-free milk only on the line that asked for it', () => {
    const input = toPlaceOrderInput(online({}), opts)
    expect(input.lines[0].recipe).toEqual([{ ingredientId: 'lf', qty: 180 }, { ingredientId: 'beans', qty: 18 }])
    expect(input.lines[1].recipe).toBeUndefined()
  })
  it('records how they really paid once delivered', () => {
    expect(toPlaceOrderInput(online({ paidBy: 'cash' }), opts).paymentMethod).toBe('cash')
  })
  it('works the total out the same way as the counter', () => {
    expect(totalWith(online({}), 15)).toBe(39.1)
    expect(totalWith(online({}), 0)).toBe(46)
  })
  it('sorts orders into the board columns', () => {
    expect(columnOf('pending')).toBe('new')
    expect(columnOf('onway')).toBe('making')
    expect(columnOf('rejected')).toBe('done')
  })
})

// The same drinks, once ordered online and once at the counter, must land the
// same in finance, billing and stock.
describe('an online order matches the same order at the counter', () => {
  beforeEach(async () => {
    await repo.clearAll()
    for (const i of [fresh, lf, beans]) await repo.put('ingredients', { ...i })
    for (const m of menu) await repo.put('menuItems', m)
  })

  const snapshot = async () => ({
    orders: await repo.all<Order>('orders'),
    stock: Object.fromEntries((await repo.all<Ingredient>('ingredients')).map(i => [i.id, i.stockQty])),
    moves: (await repo.all<InventoryAdjustment>('inventoryAdjustments')).map(a => [a.ingredientId, a.delta]).sort(),
  })
  const finance = (orders: Order[]) => buildFinanceSummary({
    range: { key: 'all', label: 'All', from: 0, to: Date.now() + 1000 }, orders, expenses: [], deletionLogs: [], departments: [], staff, categories: [], menuItems: menu, ingredients: [fresh, lf, beans],
  })

  it('for a Staff (retail) walk-in with 15% off', async () => {
    await placeOrder(toPlaceOrderInput(online({}), { host: null, staff, menuItems: menu, milk, discountPct: 15 }))
    const web = await snapshot()

    await repo.clearAll()
    for (const i of [fresh, lf, beans]) await repo.put('ingredients', { ...i })
    for (const m of menu) await repo.put('menuItems', m)
    // At the counter: walk-in, Huda picked from the suggestions, lactose-free chosen, 15% Off, card.
    await placeOrder({
      staffId: null, departmentId: null, walkin: true, customerName: 'Huda Abbas', walkinStaffId: 'huda', discountPct: 15, branch: 'audi', paymentMethod: 'card',
      lines: [
        { itemId: 'cap', name: 'Cappuccino', qty: 3, unitPrice: 12, recipe: [{ ingredientId: 'lf', qty: 180 }, { ingredientId: 'beans', qty: 18 }] },
        { itemId: 'ame', name: 'Americano', qty: 1, unitPrice: 10 },
      ],
    })
    const counter = await snapshot()

    expect(web.orders[0].total).toBe(39.1)
    expect(web.orders[0].total).toBe(counter.orders[0].total)
    expect(web.stock).toEqual(counter.stock)
    expect(web.stock).toMatchObject({ lf: 4460, fresh: 5000, beans: 928 })
    expect(web.moves).toEqual(counter.moves)

    const [f1, f2] = [finance(web.orders), finance(counter.orders)]
    expect([f1.grossSales, f1.discounts, f1.netSales]).toEqual([46, 6.9, 39.1])
    expect([f1.grossSales, f1.discounts, f1.netSales]).toEqual([f2.grossSales, f2.discounts, f2.netSales])

    const name = (id: string) => staff.find(s => s.id === id)?.name
    expect(walkinGroups(web.orders, name)).toEqual(walkinGroups(counter.orders, name))
    expect(walkinGroups(web.orders, name)[0]).toMatchObject({ name: 'Huda Abbas', total: 39.1, orderCount: 1 })
  })

  it('for a guest billed to the host department', async () => {
    const host = staff.find(s => s.id === 'sara')!
    const guest = online({ who: 'guest', ext: '302', mobile: undefined, pay: undefined, name: 'Mr Smith', discountPct: 0, total: 46 })
    await placeOrder(toPlaceOrderInput(guest, { host, staff, menuItems: menu, milk, discountPct: 0 }))
    const web = await snapshot()

    await repo.clearAll()
    for (const i of [fresh, lf, beans]) await repo.put('ingredients', { ...i })
    for (const m of menu) await repo.put('menuItems', m)
    await placeOrder({
      staffId: 'sara', departmentId: 'hr', branch: 'audi',
      lines: [
        { itemId: 'cap', name: 'Cappuccino', qty: 3, unitPrice: 12, recipe: [{ ingredientId: 'lf', qty: 180 }, { ingredientId: 'beans', qty: 18 }] },
        { itemId: 'ame', name: 'Americano', qty: 1, unitPrice: 10 },
      ],
    })
    const counter = await snapshot()

    expect(web.stock).toEqual(counter.stock)
    const range = { from: 0, to: Date.now() + 1000 }
    expect(aggregateBilling(web.orders, range).departments).toEqual(aggregateBilling(counter.orders, range).departments)
    expect(aggregateBilling(web.orders, range).departments[0]).toMatchObject({ departmentId: 'hr', total: 46 })
    expect(finance(web.orders).netSales).toBe(finance(counter.orders).netSales)
  })
})
