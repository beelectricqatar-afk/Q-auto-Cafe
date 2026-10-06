import { describe, it, expect, beforeEach } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RevenueChart } from './RevenueChart'
import type { RevenuePoint } from '../domain/revenueSeries'
import { resizeTo } from '../test-setup'

const pt = (label: string, value: number, from: number): RevenuePoint => ({ label, value, from, to: from + 1 })
const series = [pt('09:00', 120, 1), pt('10:00', 0, 2), pt('11:00', 80.5, 3)]

let user: ReturnType<typeof userEvent.setup>
const show = (points: RevenuePoint[] = series) => {
  cleanup()
  render(<RevenueChart points={points} rangeLabel="Today" />)
}
beforeEach(() => { user = userEvent.setup() })

describe('RevenueChart', () => {
  it('names the series and the window, so no legend is needed', () => {
    show()
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('QAR 200.50 in total')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument() // window named once, on the right
  })

  it('describes itself for a screen reader', () => {
    show()
    expect(screen.getByRole('img', { name: /Revenue over Today, QAR 200.50 in total/ })).toBeInTheDocument()
  })

  it('plots one label per slice', () => {
    show()
    const svg = screen.getByRole('img')
    for (const p of series) expect(within(svg).getByText(p.label)).toBeInTheDocument()
  })

  it('marks each reading with a dot while there are a month of points or fewer', () => {
    show()
    expect(screen.getAllByTestId('revenue-dot')).toHaveLength(series.length)
    const month = Array.from({ length: 31 }, (_, i) => pt(`${i + 1} Oct`, i * 10, 100 + i))
    show(month)
    expect(screen.getAllByTestId('revenue-dot')).toHaveLength(31)
  })

  it('drops the dots once they would crowd together', () => {
    const many = Array.from({ length: 32 }, (_, i) => pt(`d${i}`, i * 10, 100 + i))
    show(many)
    expect(screen.queryAllByTestId('revenue-dot')).toHaveLength(0)
  })

  it('says so when nothing was sold', () => {
    show([])
    expect(screen.getByText('No orders in this period.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('still draws an axis when every slice is zero', () => {
    show([pt('09:00', 0, 1), pt('10:00', 0, 2)])
    // A flat line at zero, not a crash or a divide-by-zero.
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByText('QAR 0.00 in total')).toBeInTheDocument()
  })

  it('shows the value for the slice under the pointer', async () => {
    show()
    const hits = document.querySelectorAll('rect[fill="transparent"]')
    await user.hover(hits[0])
    expect(screen.getByRole('status')).toHaveTextContent('09:00 · QAR 120.00')
    await user.hover(hits[2])
    expect(screen.getByRole('status')).toHaveTextContent('11:00 · QAR 80.50')
  })

  it('drops the tooltip when the pointer leaves', async () => {
    show()
    const hits = document.querySelectorAll('rect[fill="transparent"]')
    await user.hover(hits[0])
    expect(screen.getByRole('status')).toBeInTheDocument()
    await user.unhover(screen.getByRole('img'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('copes with a single slice without dividing by zero', () => {
    show([pt('09:00', 50, 1)])
    const path = document.querySelector('path[stroke="#999999"]')!
    expect(path.getAttribute('d')).not.toContain('NaN')
  })

  it('draws with the values taken from the design', () => {
    show()
    const line = document.querySelector('path[stroke="#999999"]')!
    expect(line.getAttribute('stroke-width')).toBe('2')
    expect(line.getAttribute('stroke-linecap')).toBe('round')
    // Area is the blue vertical fade at a tenth opacity, not a flat grey.
    const area = document.querySelector('path[fill="url(#revenue-fill)"]')!
    expect(area.getAttribute('opacity')).toBe('0.1')
    const stops = [...document.querySelectorAll('#revenue-fill stop')]
    expect(stops.map(s => s.getAttribute('stop-color'))).toEqual(['#465fff', '#465fff'])
    expect(stops[1].getAttribute('stop-opacity')).toBe('0')
  })

  it('writes axis money with separators, as the design does', () => {
    show([pt('09:00', 1200, 1), pt('10:00', 400, 2)])
    // axisTicks rounds 1200 up in steps of 250, so the axis tops out at 1,250.
    expect(within(screen.getByRole('img')).getByText('1,250')).toBeInTheDocument()
  })

  it('curves through the points rather than joining them with straight lines', () => {
    show()
    expect(document.querySelector('path[stroke="#999999"]')!.getAttribute('d')).toContain('C')
  })
})

describe('filling the card', () => {
  it('starts at a sensible width before it has been measured', () => {
    show()
    expect(screen.getByRole('img').getAttribute('viewBox')).toBe('0 0 900 260')
  })

  it('redraws to the width the card actually gives it', async () => {
    show()
    await act(async () => { resizeTo(1600) })
    // A fixed viewBox would letterbox here, leaving gaps down both sides.
    expect(screen.getByRole('img').getAttribute('viewBox')).toBe('0 0 1600 260')
  })

  it('spans the full width, leaving only the axis gutter', async () => {
    show()
    await act(async () => { resizeTo(1600) })
    const grid = document.querySelector('line[stroke="#f2f2f2"]')!
    expect(grid.getAttribute('x1')).toBe('56')      // room for the money labels
    expect(grid.getAttribute('x2')).toBe('1592')    // 1600 less an 8px margin
  })

  it('keeps measuring while empty, so arriving data is drawn at full width', async () => {
    show([])
    await act(async () => { resizeTo(1600) })
    cleanup()
    render(<RevenueChart points={series} rangeLabel="Today" />)
    await act(async () => { resizeTo(1600) })
    expect(screen.getByRole('img').getAttribute('viewBox')).toBe('0 0 1600 260')
  })
})
