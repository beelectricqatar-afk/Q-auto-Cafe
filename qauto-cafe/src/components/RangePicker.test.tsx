import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RangePicker } from './RangePicker'
import { defaultSelection, type RangeSelection } from '../domain/rangeSelection'

let user: ReturnType<typeof userEvent.setup>
const onChange = vi.fn()

const show = (s: RangeSelection = defaultSelection()) => {
  cleanup()
  render(<RangePicker value={s} onChange={onChange} />)
}

beforeEach(() => { user = userEvent.setup(); onChange.mockReset() })

describe('RangePicker', () => {
  it('keeps the named periods one tap away', () => {
    show()
    for (const label of ['Today', 'This week', 'This month', 'All time']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('hides the calendar inputs until Custom is chosen', () => {
    show()
    expect(screen.queryByRole('button', { name: /^Month,/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument()
  })

  it('opens on a whole month when Custom is picked', async () => {
    show()
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'pickMonth' }))
  })

  it('shows the month picker in month mode', () => {
    show(defaultSelection('pickMonth'))
    expect(screen.getByRole('button', { name: /^Month,/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument()
  })

  it('shows both date inputs in days mode', () => {
    show(defaultSelection('pickDays'))
    expect(screen.getByLabelText('From date')).toBeInTheDocument()
    expect(screen.getByLabelText('To date')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Month,/ })).not.toBeInTheDocument()
  })

  it('does not treat "This month" as the calendar month', () => {
    // Both were once called `month`; picking the preset must not open the calendar.
    show(defaultSelection('month'))
    expect(screen.queryByRole('button', { name: /^Month,/ })).not.toBeInTheDocument()
  })

  it('reports a preset choice without disturbing the calendar values', async () => {
    show({ mode: 'pickMonth', monthKey: '2026-03', fromDay: '2026-03-01', toDay: '2026-03-05' })
    await user.click(screen.getByRole('button', { name: 'All time' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'all', monthKey: '2026-03', fromDay: '2026-03-01', toDay: '2026-03-05' })
  })

  it('reports a run of months picked in the grid', async () => {
    show({ mode: 'pickMonth', monthKey: '2026-03', fromDay: '2026-03-01', toDay: '2026-03-05' })
    await user.click(screen.getByRole('button', { name: /^Month,/ }))
    await user.click(screen.getByRole('button', { name: 'January 2026' }))
    await user.click(screen.getByRole('button', { name: 'March 2026' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'pickMonth', monthKey: '2026-01', toMonthKey: '2026-03' }))
  })
})
