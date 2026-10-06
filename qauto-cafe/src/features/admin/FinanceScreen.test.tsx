import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinanceScreen } from './FinanceScreen'
import { repo } from '../../db/repo'
import { currentMonthKey, dayRange, monthRange, todayKey } from '../../domain/finance'
import type { Data } from '../../app/useData'
import type { Order } from '../../db/schema'

const data: Data = { priceList: [],
  departments: [{ id: 'd1', name: 'Sales', mainExtension: '', active: true }],
  staff: [{ id: 's1', name: 'Aisha', position: '', email: '', extension: '1', departmentId: 'd1', active: true }],
  ingredients: [],
  categories: [{ id: 'c1', name: 'Hot Drinks', sortOrder: 1 }],
  menuItems: [{ id: 'latte', name: 'Latte', categoryId: 'c1', price: 25, active: true, recipe: [] }],
}

const at = (dayOffset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}
const order = (id: string, timestamp: number, total: number): Order =>
  ({ id, timestamp, staffId: 's1', departmentId: 'd1', total, lines: [{ itemId: 'latte', name: 'Latte', qty: 1, unitPrice: total }] })

beforeEach(async () => {
  await repo.clearAll()
  await repo.put('orders', order('today', at(0), 25))
  await repo.put('orders', order('yesterday', at(-1), 40))
})

describe('FinanceScreen date range', () => {
  it('renders the current month by default', async () => {
    render(<FinanceScreen data={data} />)
    expect(screen.getByRole('heading', { name: 'Finance' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(monthRange(currentMonthKey()).label)[0]).toBeInTheDocument())
    // Both orders fall in this month (unless today is the 1st, handled below).
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Days' })).toBeInTheDocument()
  })

  it('swaps the month picker for two date pickers in Days mode', async () => {
    const user = userEvent.setup()
    render(<FinanceScreen data={data} />)
    await waitFor(() => expect(screen.getAllByText(monthRange(currentMonthKey()).label)[0]).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Days' }))
    expect(screen.getByLabelText('From date')).toBeInTheDocument()
    expect(screen.getByLabelText('To date')).toBeInTheDocument()
    // Defaults to today, and the heading reflects the single day.
    expect(screen.getByText(dayRange(todayKey(), todayKey()).label)).toBeInTheDocument()
  })

  it('narrows the report to the selected day', async () => {
    const user = userEvent.setup()
    render(<FinanceScreen data={data} />)
    await waitFor(() => expect(screen.getAllByText(monthRange(currentMonthKey()).label)[0]).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Days' }))
    // Today only: the 25 order counts, the 40 from yesterday does not.
    await waitFor(() => expect(screen.getAllByText('QAR 25.00').length).toBeGreaterThan(0))
    expect(screen.queryByText('QAR 65.00')).not.toBeInTheDocument()
  })

  it('goes back to the whole month when Month is re-selected', async () => {
    const user = userEvent.setup()
    render(<FinanceScreen data={data} />)
    await user.click(screen.getByRole('button', { name: 'Days' }))
    expect(screen.queryByRole('button', { name: /^Month,/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Month' }))
    expect(screen.getByRole('button', { name: /^Month,/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(monthRange(currentMonthKey()).label)[0]).toBeInTheDocument())
  })
})
