import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestsScreen } from './RequestsScreen'
import type { RequestsState } from './useRequests'
import type { Data } from '../../app/useData'
import type { Request } from '../../db/schema'

// Keep the screen offline: no cloud reads, no toasts about connectivity.
vi.mock('../../sync/config', () => ({ isConfigured: () => false }))
vi.mock('../../sync/client', () => ({
  client: { listRequests: vi.fn().mockResolvedValue([]), saveRequest: vi.fn().mockResolvedValue(undefined), deleteRequest: vi.fn().mockResolvedValue(undefined) },
}))

const ingredient = (name: string, stockQty = 10) =>
  ({ id: name, name, unit: 'pcs' as const, stockQty, lowStockThreshold: 2 })

const data: Data = {
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

beforeEach(() => {
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
