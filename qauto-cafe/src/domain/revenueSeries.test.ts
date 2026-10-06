import { describe, it, expect } from 'vitest'
import { axisLabelLayout, axisTicks, granularityFor, labelStride, revenueSeries } from './revenueSeries'
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

  it('stops a finished month at its last day, not the first of the next', () => {
    // August, viewed in October: 31 days, with no "1 Sep" tacked on at zero.
    const { points } = revenueSeries(
      [at(noon(2026, 7, 31), 40)],
      { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 8, 1).getTime() },
      noon(2026, 9, 6),
    )
    expect(points).toHaveLength(31)
    expect(points[30].value).toBe(40)
  })

  it('stops a finished run of months at its last month', () => {
    const { points } = revenueSeries(
      [],
      { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 9, 1).getTime() },
      noon(2026, 9, 6),
      'month',
    )
    expect(points).toHaveLength(2) // Aug, Sep — no Oct
  })

  it('slices by month when asked, whatever the length', () => {
    const { points, granularity } = revenueSeries(
      [at(noon(2026, 7, 3), 10), at(noon(2026, 7, 20), 5), at(noon(2026, 8, 9), 7)],
      { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 9, 1).getTime() },
      noon(2026, 9, 6),
      'month',
    )
    expect(granularity).toBe('month')
    expect(points.map(p => p.value)).toEqual([15, 7])
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

// A month on the dashboard: 31 columns of "5 Aug" across a card's plot area.
const monthLabels = Array.from({ length: 31 }, (_, i) => `${i + 1} Aug`)
const dayLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

describe('axisLabelLayout', () => {
  it('shows every label for a full month', () => {
    expect(axisLabelLayout(monthLabels, 840 / 30).stride).toBe(1)
  })

  it('shows every label for a day broken into hours', () => {
    expect(axisLabelLayout(dayLabels, 840 / 23).stride).toBe(1)
  })

  it('lays labels flat when they fit, and tilts them when they do not', () => {
    // Twelve months across a wide card: plenty of room each.
    expect(axisLabelLayout(['Jan', 'Feb', 'Mar'], 200).angle).toBe(0)
    expect(axisLabelLayout(monthLabels, 840 / 30).angle).toBe(-45)
  })

  it('stands labels upright rather than dropping them when a tilt is too wide', () => {
    const tight = axisLabelLayout(monthLabels, 14)
    expect(tight.angle).toBe(-90)
    expect(tight.stride).toBe(1)
  })

  it('shrinks the text before it gives up on showing every label', () => {
    // 11px a column is a month of dates on a phone-width card — still all shown.
    const sizes = [30, 16, 13, 11].map(step => axisLabelLayout(monthLabels, step))
    expect(sizes.every(l => l.stride === 1)).toBe(true)
    // Smaller slots get smaller type, never larger.
    for (let i = 1; i < sizes.length; i++) expect(sizes[i].fontSize).toBeLessThanOrEqual(sizes[i - 1].fontSize)
  })

  it('only drops labels when nothing legible fits', () => {
    const crammed = axisLabelLayout(Array.from({ length: 300 }, (_, i) => `${i} Aug`), 2)
    expect(crammed.stride).toBeGreaterThan(1)
  })

  it('reserves more room below the plot as the labels turn', () => {
    const flat = axisLabelLayout(['Jan'], 200)
    const tilted = axisLabelLayout(monthLabels, 28)
    const upright = axisLabelLayout(monthLabels, 14)
    expect(tilted.height).toBeGreaterThan(flat.height)
    expect(upright.height).toBeGreaterThan(tilted.height)
  })

  it('keeps every label inside the space it reserved', () => {
    for (const step of [200, 28, 14, 11]) {
      const l = axisLabelLayout(monthLabels, step)
      const longest = Math.max(...monthLabels.map(m => m.length)) * l.fontSize * 0.6
      const reach = l.angle === 0 ? l.fontSize : l.offset + longest * (l.angle === -45 ? Math.SQRT1_2 : 1)
      expect(reach).toBeLessThanOrEqual(l.height)
    }
  })

  it('copes with a single label and with none at all', () => {
    expect(axisLabelLayout(['Aug'], 900).stride).toBe(1)
    expect(axisLabelLayout([], 900).height).toBeGreaterThan(0)
  })
})

describe('every label shown at realistic card widths', () => {
  // The plot area a card gives the chart, wide screen down to a phone.
  const plot = (cardWidth: number) => cardWidth - 48 - 56 - 8
  it.each([1180, 900, 700, 520, 420])('shows all 31 days on a %ipx card', width => {
    expect(axisLabelLayout(monthLabels, plot(width) / 30).stride).toBe(1)
  })
  it.each([1180, 900, 700, 520, 420])('shows all 24 hours on a %ipx card', width => {
    expect(axisLabelLayout(dayLabels, plot(width) / 23).stride).toBe(1)
  })
})
