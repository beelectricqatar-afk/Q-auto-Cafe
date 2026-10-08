import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestsScreen } from './RequestsScreen'
import type { RequestsState } from './useRequests'
import type { Data } from '../../app/useData'
import type { FinanceExpense, Ingredient, Request, RequestLine } from '../../db/schema'
import { repo } from '../../db/repo'
import { client } from '../../sync/client'
import { requestMessage } from '../../domain/shoppingList'

vi.mock('../../sync/config', () => ({ isConfigured: () => false }))
vi.mock('../../sync/client', () => ({
  client: { listRequests: vi.fn().mockResolvedValue([]), saveRequest: vi.fn().mockResolvedValue(undefined), deleteRequest: vi.fn().mockResolvedValue(undefined) },
}))
const saveRequest = vi.mocked(client.saveRequest)

const milk: Ingredient = { id: 'milk', name: 'Fresh Milk', unit: 'ml', stockQty: 3000, lowStockThreshold: 2000, unitCostQar: 0.0065 }
const orange: Ingredient = { id: 'orange', name: 'Orange', unit: 'pcs', stockQty: 12, lowStockThreshold: 10, unitCostQar: 0.9 }
const dataWith = (ingredients: Ingredient[]): Data => ({ departments: [], staff: [], categories: [], menuItems: [], priceList: [], ingredients })

const line = (over: Partial<RequestLine>): RequestLine => ({ id: Math.random().toString(36).slice(2), branch: 'volkswagen', ingredientId: 'orange', name: 'Orange', unit: 'pcs', qty: 30, ...over })
const structured = (id: string, from: string, timestamp: number, lines: RequestLine[]): Request =>
  ({ id, from, timestamp, done: false, lines, message: requestMessage(lines) })

const patrick = structured('p', 'Patrick', 1, [
  line({ branch: 'volkswagen', ingredientId: 'milk', name: 'Fresh Milk', unit: 'ml', qty: 6000 }),
  line({ branch: 'volkswagen', qty: 30 }),
  line({ branch: 'audi', qty: 15 }),
])
const sara = structured('s', 'Sara', 2, [line({ branch: 'audi', ingredientId: undefined, name: 'Gloves', unit: undefined, unitLabel: 'boxes', qty: 2 })])
const freeText: Request = { id: 'old', from: 'Ali', timestamp: 0, done: false, message: 'Vw Cafe\nSugar 2kg' }

let user: ReturnType<typeof userEvent.setup>
const reload = vi.fn().mockResolvedValue(undefined)
const state = (requests: Request[]): RequestsState => ({ requests, open: requests.filter(r => !r.done).length, loading: false, failed: false, reload })

async function show(requests: Request[] = []) {
  cleanup()
  const view = render(<RequestsScreen data={dataWith(await repo.all('ingredients'))} state={state(requests)} />)
  const refresh = vi.fn(async () => { view.rerender(<RequestsScreen data={dataWith(await repo.all('ingredients'))} state={state(requests)} refresh={refresh} />) })
  view.rerender(<RequestsScreen data={dataWith(await repo.all('ingredients'))} state={state(requests)} refresh={refresh} />)
}
const list = () => within(screen.getByText(/^Shopping list/).closest('.card-hoverable') as HTMLElement)

beforeEach(async () => {
  await repo.clearAll()
  await repo.putMany('ingredients', [milk, orange])
  saveRequest.mockClear()
  user = userEvent.setup()
})

describe('sending a request', () => {
  it('picks items per cafe and sends them with exact quantities', async () => {
    await show()
    await user.type(screen.getByPlaceholderText('Your name (optional)'), 'Patrick')
    await user.type(screen.getByRole('combobox', { name: 'Add an item for VW Cafe' }), 'milk')
    await user.click(screen.getByRole('option', { name: /Fresh Milk/ }))
    await user.type(screen.getByRole('spinbutton', { name: 'How many Fresh Milk for VW Cafe' }), '6')

    await user.click(screen.getByRole('button', { name: '+ Add Audi Cafe' }))
    await user.type(screen.getByRole('combobox', { name: 'Add an item for Audi Cafe' }), 'gloves')
    await user.click(screen.getByRole('option', { name: /Add “gloves”/ }))
    await user.type(screen.getByRole('spinbutton', { name: 'How many Gloves for Audi Cafe' }), '2')
    await user.type(screen.getByRole('textbox', { name: 'Unit for Gloves' }), 'boxes')

    await user.click(screen.getByRole('button', { name: 'Send request' }))
    const sent = saveRequest.mock.calls[0][0] as Request
    expect(sent.from).toBe('Patrick')
    expect(sent.lines).toMatchObject([
      { branch: 'volkswagen', ingredientId: 'milk', name: 'Fresh Milk', unit: 'ml', qty: 6000 },
      { branch: 'audi', name: 'Gloves', unitLabel: 'boxes', qty: 2 },
    ])
    // Written out as the team always wrote them, for devices still on the old version.
    expect(sent.message).toBe('VW Cafe\nFresh Milk 6 L\n\nAudi Cafe\nGloves 2 boxes')
    // Ready for the next one.
    expect(screen.queryByRole('spinbutton', { name: /How many/ })).not.toBeInTheDocument()
  })

  it('says what is missing rather than sending', async () => {
    await show()
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one item.')
    await user.type(screen.getByRole('combobox', { name: 'Add an item for VW Cafe' }), 'ora')
    await user.click(screen.getByRole('option', { name: /^Orange/ }))
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter how many for Orange.')
    expect(saveRequest).not.toHaveBeenCalled()
  })
})

describe('the shopping list', () => {
  it('adds up the open requests, with each cafe’s share', async () => {
    await show([patrick, sara])
    expect(list().getByText('Buy 45 pcs')).toBeInTheDocument()
    expect(list().getByText('VW 30 pcs · Audi 15 pcs')).toBeInTheDocument()
    expect(list().getByText('Buy 6 L')).toBeInTheDocument()
    expect(list().getByText('Buy 2 boxes')).toBeInTheDocument()
    // 6000 ml × 0.0065 + 45 × 0.90; the gloves have no price yet.
    expect(list().getByText('QAR 79.50')).toBeInTheDocument()
    expect(list().getByText(/1 without a price/)).toBeInTheDocument()
  })

  it('drops a request when it is unticked', async () => {
    await show([patrick, sara])
    await user.click(screen.getByRole('checkbox', { name: "Add Sara's request to the shopping list" }))
    expect(list().queryByText('Gloves')).not.toBeInTheDocument()
    expect(list().getByText('Orange')).toBeInTheDocument()
  })

  it('cannot add up an old free-text request, so offers no tick for it', async () => {
    await show([freeText])
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(list().getByText('Nothing to buy. Tick an open request to add it here.')).toBeInTheDocument()
  })
})

describe('receiving the shopping list', () => {
  it('starts the receipt from the list, and keeps what was not bought on it', async () => {
    await show([patrick, sara])
    await user.click(list().getByRole('button', { name: 'Receive' }))
    expect(screen.getByRole('heading', { name: 'Receive' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /Quantity of Fresh Milk bought, in L/ })).toHaveValue(6)
    expect(screen.getByRole('spinbutton', { name: /Quantity of Orange bought/ })).toHaveValue(45)

    await user.type(screen.getByPlaceholderText('Type any vendor'), 'Lulu')
    await user.type(screen.getByPlaceholderText('As printed on the receipt'), 'R-5')
    await user.type(screen.getByRole('spinbutton', { name: /Amount paid for Fresh Milk/ }), '39')
    // Only 35 oranges in the shop.
    const oranges = screen.getByRole('spinbutton', { name: /Quantity of Orange bought/ })
    await user.clear(oranges)
    await user.type(oranges, '35')
    await user.type(screen.getByRole('spinbutton', { name: /Amount paid for Orange/ }), '35')
    expect(screen.getByText('10 pcs still to buy')).toBeInTheDocument()
    // No gloves at all.
    await user.click(screen.getByRole('checkbox', { name: 'Bought Gloves' }))
    expect(screen.getByText('Not bought · stays on the shopping list')).toBeInTheDocument()
    expect(screen.getByText('2 of 3 items bought')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Receive and add to stock' }))
    expect(await screen.findByRole('heading', { name: 'Purchase saved' })).toBeInTheDocument()

    // Patrick's request was first, so it gets all 35 oranges: VW in full, Audi 5 of 15.
    const saved = saveRequest.mock.calls.map(c => c[0] as Request)
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe('p')
    expect(saved[0].done).toBe(false)
    expect(saved[0].lines!.map(l => l.received)).toEqual([6000, 30, 5])
    expect(screen.getByText("Patrick's request stays open for Orange (10 pcs, Audi Cafe)")).toBeInTheDocument()

    expect((await repo.get<Ingredient>('ingredients', 'orange'))!.stockQty).toBe(47)
    const [expense] = await repo.all<FinanceExpense>('financeExpenses')
    expect(expense.amountQar).toBe(74)
    expect(expense.purchase!.lines.map(l => l.name)).toEqual(['Fresh Milk', 'Orange'])
  })

  it('finishes a request when everything on it comes in', async () => {
    await show([sara])
    await user.click(list().getByRole('button', { name: 'Receive' }))
    await user.type(screen.getByPlaceholderText('Type any vendor'), 'Lulu')
    await user.type(screen.getByPlaceholderText('As printed on the receipt'), 'R-6')
    await user.type(screen.getByRole('spinbutton', { name: /Amount paid for Gloves/ }), '24')
    await user.click(screen.getByRole('button', { name: 'Receive and add to stock' }))
    await screen.findByRole('heading', { name: 'Purchase saved' })
    expect(saveRequest.mock.calls[0][0]).toMatchObject({ id: 's', done: true })
    expect(screen.getByText("Sara's request is fully received")).toBeInTheDocument()
  })

  it('needs at least one item ticked', async () => {
    await show([sara])
    await user.click(list().getByRole('button', { name: 'Receive' }))
    await user.click(screen.getByRole('checkbox', { name: 'Bought Gloves' }))
    await user.click(screen.getByRole('button', { name: 'Receive and add to stock' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least one item you bought (ticked)')
  })
})
