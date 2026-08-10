import { describe, it, expect } from 'vitest'
import { axisTicks, granularityFor, labelStride, revenueSeries } from './revenueSeries'
import type { Order } from '../db/schema'

const HOUR = 3600_000
const DAY = 24 * HOUR
const at = (t: number, total: number): Order =>
  ({ id: String(t), timestamp: t, staffId: null, departmentId: null, total, lines: [] })

// A fixed clock so the tests do not drift with the real one.
const noon = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime()

describe('granularityFor', () => {
  it('slices a single day by the hour', () => {
    expect(granularityFor(8 * HOUR)).toBe('hour')
    expect(granularityFor(36 * HOUR)).toBe('hour')
  })
  it('slices weeks and months by the day', () => {
    expect(granularityFor(7 * DAY)).toBe('day')
    expect(granularityFor(92 * DAY)).toBe('day')
  })
  it('collapses anything longer to months', () => {
    expect(granularityFor(200 * DAY)).toBe('month')
  })
})

describe('revenueSeries', () => {
  it('buckets a day by the hour and totals each one', () => {
    const orders = [at(noon(2026, 7, 5, 9), 10), at(noon(2026, 7, 5, 9), 5), at(noon(2026, 7, 5, 11), 8)]
    const { points, granularity } = revenueSeries(
      orders,
      { from: noon(2026, 7, 5, 0), to: Number.MAX_SAFE_INTEGER },
      noon(2026, 7, 5, 12),
    )
    expect(granularity).toBe('hour')
    expect(points.find(p => p.label === '09:00')!.value).toBe(15)
    expect(points.find(p => p.label === '11:00')!.value).toBe(8)
  })

  it('keeps quiet slices at zero instead of skipping them', () => {
    const { points } = revenueSeries(
      [at(noon(2026, 7, 5, 9), 10)],
      { from: noon(2026, 7, 5, 8), to: Number.MAX_SAFE_INTEGER },
      noon(2026, 7, 5, 11),
    )
    expect(points.map(p => p.value)).toEqual([0, 10, 0, 0]) // 08,09,10,11
  })

  it('buckets a month by the day', () => {
    const { points, granularity } = revenueSeries(
      [at(noon(2026, 7, 2), 20), at(noon(2026, 7, 4), 30)],
      { from: noon(2026, 7, 1, 0), to: Number.MAX_SAFE_INTEGER },
      noon(2026, 7, 6),
    )
    expect(granularity).toBe('day')
    expect(points).toHaveLength(6)
    expect(points.map(p => p.value)).toEqual([0, 20, 0, 30, 0, 0])
  })

  it('closes an open-ended range off at now, not at infinity', () => {
    // Named periods carry to: MAX_SAFE_INTEGER; without clamping the span would
    // be astronomical and every range would collapse to months.
    const { granularity } = revenueSeries(
      [at(noon(2026, 7, 5, 9), 10)],
      { from: noon(2026, 7, 5, 0), to: Number.MAX_SAFE_INTEGER },
      noon(2026, 7, 5, 15),
    )
    expect(granularity).toBe('hour')
  })

  it('starts "all time" at the first order rather than 1970', () => {
    const { points, granularity } = revenueSeries(
      [at(noon(2026, 7, 3), 10), at(noon(2026, 7, 5), 10)],
      { from: 0, to: Number.MAX_SAFE_INTEGER },
      noon(2026, 7, 6),
    )
    expect(granularity).toBe('day')
    expect(points[0].label).toBe(new Date(noon(2026, 7, 3)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
  })

  it('ignores orders outside the range', () => {
    const { points } = revenueSeries(
      [at(noon(2026, 7, 1), 99), at(noon(2026, 7, 5, 9), 10)],
      { from: noon(2026, 7, 5, 0), to: noon(2026, 7, 6, 0) },
      noon(2026, 7, 5, 12),
    )
    expect(points.reduce((s, p) => s + p.value, 0)).toBe(10)
  })

  it('returns nothing for an empty window', () => {
    expect(revenueSeries([], { from: noon(2026, 7, 5), to: noon(2026, 7, 5) }, noon(2026, 7, 5)).points).toHaveLength(1)
  })

  it('rounds money to two decimals', () => {
    const t = noon(2026, 7, 5, 9)
    const { points } = revenueSeries([at(t, 0.1), at(t + 1, 0.2)], { from: noon(2026, 7, 5, 9), to: Number.MAX_SAFE_INTEGER }, t + 2)
    expect(points[0].value).toBe(0.3)
  })
})

describe('axisTicks', () => {
  it('rounds the top of the axis to a readable step', () => {
    expect(axisTicks(437)).toEqual([0, 100, 200, 300, 400, 500])
  })
  it('covers the maximum', () => {
    for (const max of [1, 9, 37, 240, 1234, 98765]) {
      expect(axisTicks(max).at(-1)!).toBeGreaterThanOrEqual(max)
    }
  })
  it('still produces an axis when there is no revenue', () => {
    expect(axisTicks(0)).toHaveLength(6)
    expect(axisTicks(0)[0]).toBe(0)
  })
})

describe('labelStride', () => {
  it('shows every label when there are few', () => {
    expect(labelStride(7)).toBe(1)
  })
  it('thins them out when there are many', () => {
    expect(labelStride(60, 12)).toBe(5)
    expect(60 / labelStride(60, 12)).toBeLessThanOrEqual(12)
  })
})
