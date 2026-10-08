import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExpensesPanel } from './ExpensesPanel'
import { useExpenseForm } from './useExpenseForm'
import { FinanceScreen } from './FinanceScreen'
import { repo } from '../../db/repo'
import { makeExpense } from '../../domain/finance'
import type { Data } from '../../app/useData'
import type { FinanceExpense } from '../../db/schema'

const today = () => new Date().toISOString().slice(0, 10)

const data: Data = { priceList: [], departments: [], staff: [], ingredients: [], categories: [], menuItems: [] }

let user: ReturnType<typeof userEvent.setup>

beforeEach(async () => {
  await repo.clearAll()
  user = userEvent.setup()
})

// The form's state is owned by the screen, so the test supplies the same hook.
function Panel() {
  return <ExpensesPanel state={useExpenseForm()} />
}

const fillAmount = (value: string) => user.type(screen.getByPlaceholderText('Amount QAR'), value)

describe('ExpensesPanel', () => {
  it('saves an expense and lists it', async () => {
    render(<Panel />)
    await user.type(screen.getByPlaceholderText('Description'), 'Milk crate')
    await user.type(screen.getByPlaceholderText('Vendor'), 'Baladna')
    await fillAmount('120')
    await user.click(screen.getByText('Save expense'))

    await screen.findByText(/Expenses \(1\)/)
    expect(screen.getByText(/Milk crate/)).toBeTruthy()
    expect(screen.getByText(/Baladna/)).toBeTruthy()

    const saved = await repo.all<FinanceExpense>('financeExpenses')
    expect(saved).toHaveLength(1)
    expect(saved[0].amountQar).toBe(120)
    expect(saved[0].date).toBe(today())
  })

  it('clears the form after saving so the next expense starts blank', async () => {
    render(<Panel />)
    await user.type(screen.getByPlaceholderText('Description'), 'Cups')
    await fillAmount('40')
    await user.click(screen.getByText('Save expense'))

    await screen.findByText(/Expenses \(1\)/)
    expect((screen.getByPlaceholderText('Description') as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText('Amount QAR') as HTMLInputElement).value).toBe('')
  })

  it('refuses an amount of zero rather than writing a free expense', async () => {
    render(<Panel />)
    await user.type(screen.getByPlaceholderText('Description'), 'Nothing')
    await fillAmount('0')
    await user.click(screen.getByText('Save expense'))

    // Nothing is written and the typed description stays put for correcting.
    expect(await repo.all<FinanceExpense>('financeExpenses')).toHaveLength(0)
    expect(screen.getByText(/Expenses \(0\)/)).toBeTruthy()
    expect((screen.getByPlaceholderText('Description') as HTMLInputElement).value).toBe('Nothing')
  })

  it('deletes an expense once the delete is confirmed', async () => {
    await repo.put('financeExpenses', makeExpense({ date: today(), category: 'supplies', vendor: '', description: 'Straws', amountQar: 15, paymentMethod: 'Cash' }))
    render(<Panel />)

    await screen.findByText(/Expenses \(1\)/)
    await user.click(screen.getByLabelText('Delete'))
    expect(screen.getByRole('alertdialog', { name: 'Delete this expense?' })).toHaveTextContent('Straws · QAR 15.00')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    await screen.findByText(/Expenses \(0\)/)
    expect(await repo.all<FinanceExpense>('financeExpenses')).toHaveLength(0)
  })

  it('keeps the expense when the delete is cancelled', async () => {
    await repo.put('financeExpenses', makeExpense({ date: today(), category: 'supplies', vendor: '', description: 'Straws', amountQar: 15, paymentMethod: 'Cash' }))
    render(<Panel />)

    await screen.findByText(/Expenses \(1\)/)
    await user.click(screen.getByLabelText('Delete'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await repo.all<FinanceExpense>('financeExpenses')).toHaveLength(1)
  })

  // This page has no month picker, so scoping the list to one month would hide
  // rows with nothing on screen explaining where they went.
  it('lists expenses from every month, not just the current one', async () => {
    await repo.put('financeExpenses', makeExpense({ date: '2023-01-09', category: 'supplies', vendor: '', description: 'Old sacks', amountQar: 30, paymentMethod: 'Cash' }))
    await repo.put('financeExpenses', makeExpense({ date: today(), category: 'supplies', vendor: '', description: 'New sacks', amountQar: 30, paymentMethod: 'Cash' }))
    render(<Panel />)

    await screen.findByText(/Expenses \(2\)/)
    expect(screen.getByText(/Old sacks/)).toBeTruthy()
    expect(screen.getByText(/New sacks/)).toBeTruthy()
  })
})

describe('the finance page after the move', () => {
  it('no longer shows the expense form or the expense list', async () => {
    render(<FinanceScreen data={data} />)
    await screen.findByText('Gross sales')

    expect(screen.queryByText('Add expense')).toBeNull()
    expect(screen.queryByText('Save expense')).toBeNull()
    expect(screen.queryByText(/^Expenses \(/)).toBeNull()
  })

  // The form moved; the money did not. COGS is expenses plus wastage, so an
  // expense entered on the requests page must still reach the finance figures.
  it('still counts expenses in COGS', async () => {
    await repo.put('financeExpenses', makeExpense({ date: today(), category: 'supplies', vendor: '', description: 'Beans', amountQar: 75, paymentMethod: 'Cash' }))
    render(<FinanceScreen data={data} />)

    await screen.findByText('COGS')
    await waitFor(() => expect(screen.getAllByText('QAR 75.00').length).toBeGreaterThan(0))
  })
})
