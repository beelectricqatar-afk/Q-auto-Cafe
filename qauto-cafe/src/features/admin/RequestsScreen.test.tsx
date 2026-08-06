import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestsScreen } from './RequestsScreen'
import type { Data } from '../../app/useData'

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

beforeEach(() => {
  user = userEvent.setup()
  render(<RequestsScreen data={data} />)
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
