import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthRangePicker } from './MonthRangePicker'

// Pinned so "the current month" and the disabled future months are stable.
const NOW = new Date(2026, 9, 6)

let user: ReturnType<typeof userEvent.setup>
const onChange = vi.fn()

const show = (from = '2026-10', to = from) => {
  cleanup()
  render(<MonthRangePicker from={from} to={to} onChange={onChange} now={NOW} />)
}
const open = () => user.click(screen.getByRole('button', { name: /^Month,/ }))
const month = (name: string) => screen.getByRole('button', { name })
const isOpen = () => screen.queryByRole('dialog') !== null

beforeEach(() => { user = userEvent.setup(); onChange.mockReset() })

describe('MonthRangePicker', () => {
  it('names what is picked on the button', () => {
    show('2026-08', '2026-10')
    expect(screen.getByRole('button', { name: 'Month, Aug – Oct 2026' })).toBeInTheDocument()
  })

  it('picks a single month with one tap, and stays open for a possible second', async () => {
    show()
    await open()
    await user.click(month('August 2026'))
    expect(onChange).toHaveBeenLastCalledWith('2026-08', '2026-08')
    expect(isOpen()).toBe(true)
    expect(screen.getByText(/Tap another month for a range/)).toBeInTheDocument()
  })

  it('keeps one month when Done is pressed after a single tap', async () => {
    show()
    await open()
    await user.click(month('August 2026'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(isOpen()).toBe(false)
  })

  it('keeps one month when the same month is tapped again', async () => {
    show()
    await open()
    await user.click(month('September 2026'))
    await user.click(month('September 2026'))
    expect(onChange).toHaveBeenLastCalledWith('2026-09', '2026-09')
    expect(isOpen()).toBe(false)
  })

  it('makes a run from a second tap, whichever order the months are tapped in', async () => {
    show()
    await open()
    await user.click(month('October 2026'))
    await user.click(month('August 2026'))
    expect(onChange).toHaveBeenLastCalledWith('2026-08', '2026-10')
    expect(isOpen()).toBe(false)
  })

  it('makes a run across years', async () => {
    show()
    await open()
    await user.click(month('February 2026'))
    await user.click(screen.getByRole('button', { name: 'Previous year' }))
    await user.click(month('November 2025'))
    expect(onChange).toHaveBeenLastCalledWith('2025-11', '2026-02')
  })

  it('does not offer months that have not happened yet', async () => {
    show()
    await open()
    expect(month('November 2026')).toBeDisabled()
    expect(month('October 2026')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()
  })

  it('marks every month in the picked run', async () => {
    show('2026-06', '2026-09')
    await open()
    for (const m of ['June', 'July', 'August', 'September']) expect(month(`${m} 2026`)).toHaveAttribute('aria-pressed', 'true')
    expect(month('May 2026')).toHaveAttribute('aria-pressed', 'false')
    expect(month('October 2026')).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers this month and the last three months in one tap', async () => {
    show('2025-01')
    await open()
    await user.click(screen.getByRole('button', { name: 'Last 3 months' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-08', '2026-10')
    await open()
    await user.click(screen.getByRole('button', { name: 'This month' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-10', '2026-10')
  })

  it('closes on Escape without changing the pick', async () => {
    show()
    await open()
    await user.keyboard('{Escape}')
    expect(isOpen()).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })
})
