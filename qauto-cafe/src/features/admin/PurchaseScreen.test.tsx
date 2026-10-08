import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestsScreen } from './RequestsScreen'
import type { RequestsState } from './useRequests'
import type { Data } from '../../app/useData'
import type { FinanceExpense, Ingredient, InventoryAdjustment } from '../../db/schema'
import { repo } from '../../db/repo'

vi.mock('../../sync/config', () => ({ isConfigured: () => false }))
vi.mock('../../sync/client', () => ({
  client: { listRequests: vi.fn().mockResolvedValue([]), saveRequest: vi.fn(), deleteRequest: vi.fn() },
}))

const milk: Ingredient = { id: 'milk', name: 'Fresh Milk', unit: 'ml', stockQty: 3000, lowStockThreshold: 2000, unitCostQar: 0.006 }
const orange: Ingredient = { id: 'orange', name: 'Orange', unit: 'pcs', stockQty: 12, lowStockThreshold: 10, unitCostQar: 0.9 }

const state: RequestsState = { requests: [], open: 0, loading: false, failed: false, reload: vi.fn().mockResolvedValue(undefined) }
let user: ReturnType<typeof userEvent.setup>

const dataWith = (ingredients: Ingredient[]): Data => ({ departments: [], staff: [], categories: [], menuItems: [], priceList: [], ingredients })

/** Renders the screen the way the admin panel does: refresh re-reads the ingredients and re-renders. */
async function show() {
  cleanup()
  const view = render(<RequestsScreen data={dataWith(await repo.all<Ingredient>('ingredients'))} state={state} />)
  const refresh = vi.fn(async () => {
    view.rerender(<RequestsScreen data={dataWith(await repo.all<Ingredient>('ingredients'))} state={state} refresh={refresh} />)
  })
  view.rerender(<RequestsScreen data={dataWith(await repo.all<Ingredient>('ingredients'))} state={state} refresh={refresh} />)
  return refresh
}

const pickItem = async (query: string, option: RegExp) => {
  await user.type(screen.getByRole('combobox', { name: /Add an item from the receipt/ }), query)
  await user.click(screen.getByRole('option', { name: option }))
}

beforeEach(async () => {
  await repo.clearAll()
  await repo.putMany('ingredients', [milk, orange])
  user = userEvent.setup()
})

describe('Add purchase', () => {
  it('opens a blank receipt from the Purchases card, with no request needed', async () => {
    await show()
    await user.click(screen.getByRole('button', { name: '+ Add purchase' }))
    expect(screen.getByRole('heading', { name: 'Add purchase' })).toBeInTheDocument()
    expect(screen.getByText('Add the items on the receipt below.')).toBeInTheDocument()
  })

  it('says what is missing instead of saving half a receipt', async () => {
    await show()
    await user.click(screen.getByRole('button', { name: '+ Add purchase' }))
    await user.click(screen.getByRole('button', { name: /Save purchase/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the vendor, the receipt number, at least one item.')
    expect(await repo.all('financeExpenses')).toHaveLength(0)
  })

  it('adds stock, sets the new price and records one expense', async () => {
    const refresh = await show()
    await user.click(screen.getByRole('button', { name: '+ Add purchase' }))
    await user.type(screen.getByPlaceholderText('Type any vendor'), 'Abu Ali Grocery')
    await user.type(screen.getByPlaceholderText('As printed on the receipt'), 'INV-77')
    await user.click(screen.getByRole('button', { name: 'Card' }))

    await pickItem('milk', /Fresh Milk/)
    await user.type(screen.getByRole('spinbutton', { name: /Quantity of Fresh Milk bought, in L/ }), '6')
    await user.type(screen.getByRole('spinbutton', { name: /Amount paid for Fresh Milk/ }), '39')
    expect(screen.getByText('6.50 / L')).toBeInTheDocument()

    await pickItem('ora', /^Orange/)
    await user.type(screen.getByRole('spinbutton', { name: /Quantity of Orange bought/ }), '15')
    await user.type(screen.getByRole('spinbutton', { name: /Amount paid for Orange/ }), '20')
    expect(screen.getByText(/↑ 48% from 0.90/)).toBeInTheDocument()

    await pickItem('gloves', /Add “gloves” \(not a stock item\)/)
    await user.type(screen.getByRole('spinbutton', { name: /Amount paid for Gloves/ }), '12.5')

    expect(screen.getByText('QAR 71.50')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save purchase/ }))

    expect(await screen.findByRole('heading', { name: 'Purchase saved' })).toBeInTheDocument()
    expect(screen.getByText('Fresh Milk: 3000 → 9000 ml')).toBeInTheDocument()
    expect(screen.getByText('Orange: 12 → 27 pcs')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()

    const [m, o] = ['milk', 'orange'].map(id => repo.get<Ingredient>('ingredients', id))
    expect((await m)!.stockQty).toBe(9000)
    expect((await m)!.unitCostQar).toBe(0.0065)
    expect((await o)!.priceHistory).toHaveLength(1)

    const [expense] = await repo.all<FinanceExpense>('financeExpenses')
    expect(expense).toMatchObject({ vendor: 'Abu Ali Grocery', reference: 'INV-77', paymentMethod: 'Card', amountQar: 71.5, category: 'supplies' })
    const adjustments = await repo.all<InventoryAdjustment>('inventoryAdjustments')
    expect(adjustments.map(a => a.reason)).toEqual(['restock', 'restock'])
  })

  it('takes a price each and works out the line total', async () => {
    await show()
    await user.click(screen.getByRole('button', { name: '+ Add purchase' }))
    await pickItem('ora', /^Orange/)
    await user.type(screen.getByRole('spinbutton', { name: /Quantity of Orange bought/ }), '10')
    await user.click(screen.getByRole('button', { name: 'Enter price each' }))
    await user.type(screen.getByRole('spinbutton', { name: /Price per pcs of Orange/ }), '1.5')
    expect(screen.getAllByText('QAR 15.00').length).toBeGreaterThan(0)
  })

  it('does not put the same stock item on the receipt twice', async () => {
    await show()
    await user.click(screen.getByRole('button', { name: '+ Add purchase' }))
    await pickItem('ora', /^Orange/)
    await pickItem('ora', /^Orange/)
    expect(screen.getAllByRole('spinbutton', { name: /Quantity of Orange/ })).toHaveLength(1)
  })

  it('asks before throwing away a receipt that has been started', async () => {
    await show()
    await user.click(screen.getByRole('button', { name: '+ Add purchase' }))
    await user.type(screen.getByPlaceholderText('Type any vendor'), 'Lulu')
    await user.click(screen.getByRole('button', { name: '← Requests' }))
    expect(screen.getByRole('alertdialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('button', { name: '+ Add purchase' })).toBeInTheDocument()
  })
})

describe('Undo a purchase', () => {
  it('puts stock, price and the expense back', async () => {
    await show()
    await user.click(screen.getByRole('button', { name: '+ Add purchase' }))
    await user.type(screen.getByPlaceholderText('Type any vendor'), 'Lulu')
    await user.type(screen.getByPlaceholderText('As printed on the receipt'), '9')
    await pickItem('ora', /^Orange/)
    await user.type(screen.getByRole('spinbutton', { name: /Quantity of Orange bought/ }), '15')
    await user.type(screen.getByRole('spinbutton', { name: /Amount paid for Orange/ }), '20')
    await user.click(screen.getByRole('button', { name: /Save purchase/ }))
    await screen.findByRole('heading', { name: 'Purchase saved' })

    // Back on Requests with the ingredients as they are now.
    await show()
    expect(await screen.findByText('Lulu · 9')).toBeInTheDocument()
    // The expense list points to Purchases rather than offering a delete that would leave stock behind.
    expect(screen.getByText('purchase')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Undo purchase 9 from Lulu/ }))
    await user.click(screen.getByRole('button', { name: 'Undo purchase' }))

    await screen.findByText(/Bought something\?/)
    const o = await repo.get<Ingredient>('ingredients', 'orange')
    expect(o!.stockQty).toBe(12)
    expect(o!.unitCostQar).toBe(0.9)
    expect(await repo.all('financeExpenses')).toHaveLength(0)
  })
})
