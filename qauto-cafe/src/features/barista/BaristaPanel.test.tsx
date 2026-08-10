import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BaristaPanel } from './BaristaPanel'
import { repo } from '../../db/repo'
import type { Data } from '../../app/useData'
import type { Ingredient, MenuItem } from '../../db/schema'

const ing = (id: string, name: string, unit: Ingredient['unit'], stockQty: number): Ingredient =>
  ({ id, name, unit, stockQty, lowStockThreshold: 10 })

const fresh = ing('fresh', 'Fresh Milk', 'ml', 1000)
const lactoseFree = ing('lf', 'Lactose Free Milk', 'ml', 1000)
const condensed = ing('cond', 'Condensed Milk', 'g', 1000)
const beans = ing('beans', 'Coffee Beans', 'g', 1000)

const latte: MenuItem = {
  id: 'latte', name: 'Latte', categoryId: 'hot', price: 12, active: true,
  recipe: [{ ingredientId: 'beans', qty: 18 }, { ingredientId: 'fresh', qty: 180 }],
}
const espresso: MenuItem = {
  id: 'espresso', name: 'Espresso', categoryId: 'hot', price: 8, active: true,
  recipe: [{ ingredientId: 'beans', qty: 18 }],
}
const karak: MenuItem = {
  id: 'karak', name: 'Karak Tea', categoryId: 'hot', price: 5, active: true,
  recipe: [{ ingredientId: 'cond', qty: 30 }],
}
const flakes: MenuItem = {
  id: 'flakes', name: 'Chocolate Flakes', categoryId: 'hot', price: 0, active: true, addOn: true,
  recipe: [{ ingredientId: 'beans', qty: 5 }],
}

const data: Data = {
  departments: [{ id: 'd1', name: 'Audi Service', mainExtension: '', active: true }],
  staff: [{ id: 's1', name: 'Aisha', position: '', email: '', extension: '412', departmentId: 'd1', active: true }],
  categories: [{ id: 'hot', name: 'Hot Drinks', sortOrder: 1 }],
  menuItems: [latte, espresso, karak, flakes],
  ingredients: [beans, condensed, lactoseFree, fresh],
}

let user: ReturnType<typeof userEvent.setup>
const onPlaced = vi.fn()

beforeEach(async () => {
  await repo.clearAll()
  for (const i of data.ingredients) await repo.put('ingredients', { ...i })
  for (const m of data.menuItems) await repo.put('menuItems', m)
  user = userEvent.setup()
  onPlaced.mockClear()
  render(<BaristaPanel data={data} onPlaced={onPlaced} />)
})

const tile = (name: RegExp) => screen.getByRole('button', { name })
const ticket = () => within(screen.getByRole('region', { name: 'Ticket' }))
const milkDialog = () => screen.getByRole('dialog', { name: /^Milk for/ })
const cafeDialog = () => screen.getByRole('dialog', { name: /Which cafe/ })
/** Place Order now asks which cafe before the order is written. */
const chooseCafe = async (name: 'Audi' | 'Volkswagen' = 'Audi') => {
  await user.click(screen.getByRole('button', { name: 'Place Order' }))
  await user.click(within(cafeDialog()).getByRole('button', { name }))
}
const placeWalkIn = async () => {
  await user.click(screen.getByRole('button', { name: 'Walk-in' }))
  await chooseCafe()
}

describe('items that do not use milk', () => {
  it('go straight onto the ticket with no popup', async () => {
    await user.click(tile(/Espresso/))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ticket().getByText('Espresso')).toBeInTheDocument()
  })

  it('do not ask about milk just because the recipe has condensed milk', async () => {
    await user.click(tile(/Karak Tea/))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ticket().getByText('Karak Tea')).toBeInTheDocument()
  })

  it('still add free add-ons without a popup', async () => {
    await user.click(tile(/Chocolate Flakes/))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ticket().getAllByText('Free').length).toBeGreaterThan(0)
  })
})

describe('choosing the milk', () => {
  it('offers both milks, with the recipe’s own marked as current', async () => {
    await user.click(tile(/Latte/))
    const d = within(milkDialog())
    expect(d.getByRole('button', { name: /Fresh Milk/ })).toBeInTheDocument()
    expect(d.getByRole('button', { name: /Lactose Free Milk/ })).toBeInTheDocument()
    expect(d.getByRole('button', { name: /Fresh Milk/ })).toHaveTextContent('1000ml in stock')
  })

  it('adds nothing if the popup is dismissed', async () => {
    await user.click(tile(/Latte/))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(ticket().getByText('No items yet')).toBeInTheDocument()
  })

  it('deducts fresh milk when fresh is chosen', async () => {
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Fresh Milk/ }))
    await placeWalkIn()
    expect((await repo.get('ingredients', 'fresh'))!.stockQty).toBe(820) // 1000 - 180
    expect((await repo.get('ingredients', 'lf'))!.stockQty).toBe(1000)   // untouched
  })

  it('deducts lactose-free milk instead when that is chosen', async () => {
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Lactose Free Milk/ }))
    await placeWalkIn()
    expect((await repo.get('ingredients', 'lf'))!.stockQty).toBe(820)    // 1000 - 180
    expect((await repo.get('ingredients', 'fresh'))!.stockQty).toBe(1000) // untouched
  })

  it('keeps the rest of the recipe when the milk is swapped', async () => {
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Lactose Free Milk/ }))
    await placeWalkIn()
    expect((await repo.get('ingredients', 'beans'))!.stockQty).toBe(982) // 1000 - 18
  })

  it('leaves the menu recipe on fresh milk', async () => {
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Lactose Free Milk/ }))
    await placeWalkIn()
    expect((await repo.get('menuItems', 'latte')).recipe).toEqual(latte.recipe)
  })
})

describe('the ticket line', () => {
  it('flags a lactose-free drink but not a standard one', async () => {
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Fresh Milk/ }))
    expect(ticket().queryByText('LACTOSE FREE')).not.toBeInTheDocument()

    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Lactose Free Milk/ }))
    expect(ticket().getByText('LACTOSE FREE')).toBeInTheDocument()
  })

  it('keeps the two milks on separate lines', async () => {
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Fresh Milk/ }))
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Lactose Free Milk/ }))
    expect(ticket().getAllByText('Latte')).toHaveLength(2)
  })

  it('offers Change milk only on milk drinks', async () => {
    await user.click(tile(/Espresso/))
    expect(ticket().queryByRole('button', { name: 'Change milk' })).not.toBeInTheDocument()
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Fresh Milk/ }))
    expect(ticket().getByRole('button', { name: 'Change milk' })).toBeInTheDocument()
  })

  it('switches the milk on a line already added', async () => {
    await user.click(tile(/Latte/))
    await user.click(within(milkDialog()).getByRole('button', { name: /Fresh Milk/ }))
    await user.click(ticket().getByRole('button', { name: 'Change milk' }))
    await user.click(within(milkDialog()).getByRole('button', { name: /Lactose Free Milk/ }))
    expect(ticket().getByText('LACTOSE FREE')).toBeInTheDocument()

    await placeWalkIn()
    expect((await repo.get('ingredients', 'lf'))!.stockQty).toBe(820)
    expect((await repo.get('ingredients', 'fresh'))!.stockQty).toBe(1000)
  })
})

describe('the Place Order button', () => {
  const placeButton = () => screen.getByRole('button', { name: 'Place Order' })

  it('is dark and inert while the ticket is empty', () => {
    expect(placeButton()).toBeDisabled()
    expect(placeButton()).toHaveStyle({ background: '#3A3A3A' })
  })

  it('turns white with black text as soon as an item is added', async () => {
    await user.click(tile(/Espresso/))
    expect(placeButton()).toHaveStyle({ background: '#fff', color: '#1A1A1A' })
    expect(placeButton()).toBeEnabled()
  })

  it('places without a source, recorded as a walk-in', async () => {
    await user.click(tile(/Espresso/))
    await chooseCafe()
    const [order] = await repo.all<{ walkin?: boolean; staffId: string | null; departmentId: string | null; customerName?: string }>('orders')
    expect(order).toMatchObject({ walkin: true, staffId: null, departmentId: null })
    expect(order.customerName).toBeUndefined()
  })

  it('still attributes the order when a source was chosen', async () => {
    await user.click(tile(/Espresso/))
    await user.click(screen.getByRole('button', { name: 'Walk-in' }))
    await chooseCafe()
    expect((await repo.all<{ walkin?: boolean }>('orders'))[0].walkin).toBe(true)
  })

  it('goes back to dark once the ticket is cleared', async () => {
    await user.click(tile(/Espresso/))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(placeButton()).toBeDisabled()
    expect(placeButton()).toHaveStyle({ background: '#3A3A3A' })
  })
})

describe('choosing the cafe', () => {
  const orders = () => repo.all<{ branch?: string; total: number }>('orders')

  it('asks which cafe instead of placing straight away', async () => {
    await user.click(tile(/Espresso/))
    await user.click(screen.getByRole('button', { name: 'Place Order' }))
    expect(cafeDialog()).toBeInTheDocument()
    expect(await orders()).toHaveLength(0) // nothing written yet
  })

  it('offers both cafes', async () => {
    await user.click(tile(/Espresso/))
    await user.click(screen.getByRole('button', { name: 'Place Order' }))
    const d = within(cafeDialog())
    expect(d.getByRole('button', { name: 'Audi' })).toBeInTheDocument()
    expect(d.getByRole('button', { name: 'Volkswagen' })).toBeInTheDocument()
  })

  it('tags the order with Audi', async () => {
    await user.click(tile(/Espresso/))
    await chooseCafe('Audi')
    expect((await orders())[0].branch).toBe('audi')
  })

  it('tags the order with Volkswagen', async () => {
    await user.click(tile(/Espresso/))
    await chooseCafe('Volkswagen')
    expect((await orders())[0].branch).toBe('volkswagen')
  })

  it('places nothing if the chooser is dismissed', async () => {
    await user.click(tile(/Espresso/))
    await user.click(screen.getByRole('button', { name: 'Place Order' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(await orders()).toHaveLength(0)
    expect(ticket().getByText('Espresso')).toBeInTheDocument() // ticket intact
  })

  it('clears the ticket once a cafe is chosen', async () => {
    await user.click(tile(/Espresso/))
    await chooseCafe()
    expect(ticket().getByText('No items yet')).toBeInTheDocument()
    expect(onPlaced).toHaveBeenCalled()
  })
})
