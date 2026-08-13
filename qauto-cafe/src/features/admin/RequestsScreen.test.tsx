import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestsScreen } from './RequestsScreen'
import type { RequestsState } from './useRequests'
import type { Data } from '../../app/useData'
import type { FinanceExpense, Request } from '../../db/schema'
import { repo } from '../../db/repo'
import { PRICE_LIST } from '../../domain/priceList'

// Keep the screen offline: no cloud reads, no toasts about connectivity.
vi.mock('../../sync/config', () => ({ isConfigured: () => false }))
vi.mock('../../sync/client', () => ({
  client: { listRequests: vi.fn().mockResolvedValue([]), saveRequest: vi.fn().mockResolvedValue(undefined), deleteRequest: vi.fn().mockResolvedValue(undefined) },
}))

const ingredient = (name: string, stockQty = 10) =>
  ({ id: name, name, unit: 'pcs' as const, stockQty, lowStockThreshold: 2 })

const data: Data = { priceList: PRICE_LIST,
  departments: [], staff: [], categories: [], menuItems: [],
  ingredients: [
    ingredient('Fresh Orange', 9),
    ingredient('Orange Juice'),
    ingredient('Lemon', 40),
    ingredient('Mint Leaves'),
    ingredient('Caramel Sauce'),
    ingredient('Caramel Sauce'), // the live inventory really does have duplicates
  ],
}

const box = () => screen.getByPlaceholderText(/We need more oranges/i)
let user: ReturnType<typeof userEvent.setup>

const state = (requests: Request[] = []): RequestsState => ({
  requests, open: requests.filter(r => !r.done).length, loading: false, failed: false,
  reload: vi.fn().mockResolvedValue(undefined),
})

beforeEach(async () => {
  await repo.clearAll()
  user = userEvent.setup()
  render(<RequestsScreen data={data} state={state()} />)
})

describe('Requests inventory type-ahead', () => {
  it('offers matching inventory items as you type', async () => {
    await user.type(box(), 'we need ora')
    expect(screen.getByRole('option', { name: /Orange Juice/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Fresh Orange/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Lemon/ })).not.toBeInTheDocument()
  })

  it('shows the current stock beside each suggestion', async () => {
    await user.type(box(), 'lem')
    expect(screen.getByRole('option', { name: /Lemon/ })).toHaveTextContent('40pcs')
  })

  it('stays out of the way until there is enough to match on', async () => {
    await user.type(box(), 'o')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('completes the word when a suggestion is clicked, keeping the rest', async () => {
    await user.type(box(), 'we need ora')
    await user.click(screen.getByRole('option', { name: /Fresh Orange/ }))
    expect(box()).toHaveValue('we need Fresh Orange ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('lets typing continue straight after a completion', async () => {
    await user.type(box(), 'we need ora')
    await user.click(screen.getByRole('option', { name: /Orange Juice/ }))
    await user.type(box(), '5 boxes')
    expect(box()).toHaveValue('we need Orange Juice 5 boxes')
  })

  it('picks a suggestion with the arrow keys and Enter', async () => {
    await user.type(box(), 'ora')
    await user.keyboard('{ArrowDown}{Enter}') // second in the list
    expect(box()).toHaveValue('Fresh Orange ')
  })

  it('completes with Tab without submitting anything', async () => {
    await user.type(box(), 'mint')
    await user.keyboard('{Tab}')
    expect(box()).toHaveValue('Mint Leaves ')
  })

  it('dismisses on Escape and leaves the typed text alone', async () => {
    await user.type(box(), 'we need ora')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(box()).toHaveValue('we need ora')
  })

  it('offers a duplicated inventory item only once', async () => {
    await user.type(box(), 'caramel')
    expect(screen.getAllByRole('option', { name: /Caramel Sauce/ })).toHaveLength(1)
  })

  it('completes a word in the middle of a sentence', async () => {
    await user.type(box(), 'need ora, 5kg')
    await user.keyboard('{ArrowLeft>5/}') // back to just after "ora"
    await user.click(screen.getByRole('option', { name: /Fresh Orange/ }))
    // No stray space before the comma, and the tail survives.
    expect(box()).toHaveValue('need Fresh Orange, 5kg')
    // The completed name matches itself, so the list must not reopen.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

// The real message that used to render as "Fresh Orange Fresh Apple Mint Leaves".
const listed: Request = {
  id: 'r1', timestamp: Date.UTC(2026, 7, 5, 9, 30),
  from: 'Patrick', done: false,
  message: 'Fresh Orange \n\nFresh Apple \n\nMint Leaves',
}
const withQty: Request = {
  id: 'r2', timestamp: Date.UTC(2026, 7, 4, 8, 0),
  from: 'Patrick', done: true,
  message: 'Fresh milk.   - 6 ltrs\nMint leaves -   1 bundle',
}

const renderWith = (requests: Request[]) => {
  cleanup()
  render(<RequestsScreen data={data} state={state(requests)} />)
}

describe('how a request is listed', () => {
  it('puts each requested item on its own line', () => {
    renderWith([listed])
    for (const item of ['Fresh Orange', 'Fresh Apple', 'Mint Leaves']) {
      expect(screen.getAllByText(item).length).toBeGreaterThan(0)
    }
    // Not run together on one line, which is what the plain string produced.
    expect(screen.queryByText('Fresh Orange Fresh Apple Mint Leaves')).not.toBeInTheDocument()
  })

  it('keeps a quantity beside its item rather than under it', () => {
    renderWith([withQty])
    expect(screen.getAllByText('Fresh milk. - 6 ltrs').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mint leaves - 1 bundle').length).toBeGreaterThan(0)
  })
})

describe('opening a request', () => {
  it('shows the full details in a popup', async () => {
    renderWith([listed])
    await user.click(screen.getByTitle('Open this request'))
    const dialog = within(screen.getByRole('dialog', { name: 'Request' }))
    expect(dialog.getByText('Patrick')).toBeInTheDocument()
    expect(dialog.getByText('Open')).toBeInTheDocument()
    for (const item of ['Fresh Orange', 'Fresh Apple', 'Mint Leaves']) {
      expect(dialog.getByText(item)).toBeInTheDocument()
    }
  })

  it('opens for a request that is already done, and offers to reopen it', async () => {
    renderWith([withQty])
    await user.click(screen.getByTitle('Open this request'))
    const dialog = within(screen.getByRole('dialog', { name: 'Request' }))
    expect(dialog.getByText('Done')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })

  it('closes again', async () => {
    renderWith([listed])
    await user.click(screen.getByTitle('Open this request'))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('expenses on the requests page', () => {
  it('shows the expense form beside the request form, with its list under it', async () => {
    expect(screen.getByText('Send a request to the admin')).toBeInTheDocument()
    expect(screen.getByText('Add expense')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeInTheDocument()
    expect(await screen.findByText(/^Expenses \(/)).toBeInTheDocument()
  })
})

// The real requests are grouped under cafe headings, which is where the branch
// is written — so the fixture keeps that shape.
const grouped: Request = {
  id: 'r3', timestamp: Date.UTC(2026, 7, 6, 7, 0),
  from: 'Patrick', done: false,
  message: 'Audi Cafe\n\nFresh Milk   4 ltrs\n\nLemon 10pcs\n\nVw Cafe\n\nMint Leaves  2 Bundles\n\nFor Drink Testing\n\n12 bottles of sparkling water',
}

// Scoped to the dialog: the collapsed row lists the same item text, so an
// unscoped query matches the row button that opens the request as well.
const openItem = async (label: string | RegExp) => {
  await user.click(screen.getByTitle('Open this request'))
  const dialog = within(screen.getByRole('dialog', { name: 'Request' }))
  await user.click(dialog.getByRole('button', { name: label }))
}
const field = (placeholder: string) => screen.getByPlaceholderText(placeholder) as HTMLInputElement

describe('raising an expense from a requested item', () => {
  it('fills the description with the quantity, the name and the cafe', async () => {
    renderWith([grouped])
    await openItem(/Fresh Milk 4 ltrs/)
    expect(field('Description').value).toBe('Fresh Milk 4 ltrs - Audi')
  })

  it('takes the cafe from the heading the item sits under', async () => {
    renderWith([grouped])
    await openItem(/Mint Leaves 2 Bundles/)
    expect(field('Description').value).toBe('Mint Leaves 2 Bundles - Volkswagen')
  })

  it('leaves the cafe out when the request never named one', async () => {
    renderWith([grouped])
    await openItem(/12 bottles of sparkling water/)
    expect(field('Description').value).toBe('12 bottles of sparkling water')
  })

  it('books it as supplies, dated today', async () => {
    renderWith([grouped])
    await openItem(/Lemon 10pcs/)
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('supplies')
    expect((screen.getByLabelText('Expense date') as HTMLInputElement).value).toBe(new Date().toISOString().slice(0, 10))
  })

  // A request says what is needed, never who sold it or against which invoice.
  it('leaves what the request cannot know for the admin to fill in', async () => {
    renderWith([grouped])
    await openItem(/Lemon 10pcs/)
    expect(field('Vendor').value).toBe('')
    expect(field('Reference').value).toBe('')
    expect(screen.getByPlaceholderText('Notes')).toHaveValue('')
  })

  it('replaces a half-typed expense rather than merging into it', async () => {
    renderWith([grouped])
    await user.type(field('Vendor'), 'Someone else')
    await user.type(field('Amount QAR'), '999')
    await openItem(/Lemon 10pcs/)
    expect(field('Vendor').value).toBe('')
    // Replaced by the sheet's figure for this item, not left as the typed 999.
    expect(field('Amount QAR').value).toBe('10.2')
    expect(field('Description').value).toBe('Lemon 10pcs - Audi')
  })

  // The form it fills sits behind the dialog, so the dialog gets out of the way.
  it('closes the request popup so the filled form is visible', async () => {
    renderWith([grouped])
    await openItem(/Lemon 10pcs/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not offer a cafe heading as something to buy', async () => {
    renderWith([grouped])
    await user.click(screen.getByTitle('Open this request'))
    const dialog = within(screen.getByRole('dialog', { name: 'Request' }))
    expect(dialog.getByText('Audi Cafe')).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: /Audi Cafe/ })).not.toBeInTheDocument()
  })

  it('saves the expense once the admin adds the amount', async () => {
    renderWith([grouped])
    await openItem(/Lemon 10pcs/)
    await user.clear(field('Amount QAR'))
    await user.type(field('Amount QAR'), '60')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await screen.findByText(/Expenses \(1\)/)
    const saved = await repo.all<FinanceExpense>('financeExpenses')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ category: 'supplies', description: 'Lemon 10pcs - Audi', amountQar: 60 })
  })
})

describe('the payment method', () => {
  // Everything here is bought with petty cash, so there is nothing to choose.
  it('is not asked for at all', () => {
    expect(screen.queryByLabelText('Payment method')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Payment method')).not.toBeInTheDocument()
  })

  it('is still recorded as cash on the saved expense', async () => {
    await user.type(field('Description'), 'Napkins')
    await user.type(field('Amount QAR'), '20')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await screen.findByText(/Expenses \(1\)/)
    expect((await repo.all<FinanceExpense>('financeExpenses'))[0].paymentMethod).toBe('Cash')
  })
})

describe('estimating what a requested item costs', () => {
  it('fills the amount from the price sheet', async () => {
    renderWith([grouped])
    await openItem(/Fresh Milk 4 ltrs/)
    expect(field('Amount QAR').value).toBe('30')   // 4 litres x QAR 7.50
  })

  it('prices counted items one by one', async () => {
    renderWith([grouped])
    await openItem(/Lemon 10pcs/)
    expect(field('Amount QAR').value).toBe('10.2') // 10 x QAR 1.02
  })

  // The sheet prices sparkling water per 250 mL and says nothing about bottles.
  it('leaves the amount blank when the sheet cannot say', async () => {
    renderWith([grouped])
    await openItem(/12 bottles of sparkling water/)
    expect(field('Amount QAR').value).toBe('')
  })

  it('shows the estimate on the row before it is clicked', async () => {
    renderWith([grouped])
    await user.click(screen.getByTitle('Open this request'))
    const dialog = within(screen.getByRole('dialog', { name: 'Request' }))
    expect(dialog.getByRole('button', { name: /Fresh Milk 4 ltrs/ })).toHaveTextContent('QAR 30.00')
  })

  // The whole point is that it is a starting point, not a decision.
  it('lets the admin type over the estimate', async () => {
    renderWith([grouped])
    await openItem(/Lemon 10pcs/)
    await user.clear(field('Amount QAR'))
    await user.type(field('Amount QAR'), '12.5')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await screen.findByText(/Expenses \(1\)/)
    expect((await repo.all<FinanceExpense>('financeExpenses'))[0].amountQar).toBe(12.5)
  })

  it('saves the estimate untouched when the admin accepts it', async () => {
    renderWith([grouped])
    await openItem(/Fresh Milk 4 ltrs/)
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await screen.findByText(/Expenses \(1\)/)
    expect((await repo.all<FinanceExpense>('financeExpenses'))[0]).toMatchObject({ amountQar: 30, category: 'supplies' })
  })
})
