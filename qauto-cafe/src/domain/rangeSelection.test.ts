import { describe, it, expect } from 'vitest'
import { defaultSelection, isPreset, PRESETS, selectionRange } from './rangeSelection'
import { monthRange, monthSpanLabel, monthSpanRange, dayRange } from './finance'

describe('rangeSelection', () => {
  it('offers the named periods the dashboard already had', () => {
    expect(PRESETS).toEqual(['today', 'week', 'month', 'all'])
  })

  it('knows a preset from a calendar choice', () => {
    expect(isPreset('today')).toBe(true)
    expect(isPreset('all')).toBe(true)
    expect(isPreset('pickMonth')).toBe(false) // the calendar month, not "This month"
    expect(isPreset('pickDays')).toBe(false)
    // The preset keeps its own name; the two must never be confused.
    expect(selectionRange(defaultSelection('month')).label).toBe('This month')
  })

  it('starts on today, with the calendar fields ready', () => {
    const s = defaultSelection()
    expect(s.mode).toBe('today')
    expect(s.monthKey).toMatch(/^\d{4}-\d{2}$/)
    expect(s.fromDay).toBe(s.toDay)
    expect(s.fromDay).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('resolves a preset to its named window', () => {
    const r = selectionRange(defaultSelection('all'))
    expect(r.label).toBe('All time')
    expect(r.from).toBe(0)
  })

  it('resolves a chosen month to that whole month', () => {
    const s = { ...defaultSelection('pickMonth'), monthKey: '2026-03' }
    expect(selectionRange(s)).toEqual(monthRange('2026-03'))
  })

  it('resolves a run of months to the whole run', () => {
    const s = { ...defaultSelection('pickMonth'), monthKey: '2026-08', toMonthKey: '2026-10' }
    const r = selectionRange(s)
    expect(r.from).toBe(monthRange('2026-08').from)
    expect(r.to).toBe(monthRange('2026-10').to)
    expect(r.label).toBe(monthSpanLabel('2026-08', '2026-10'))
  })

  it('treats a run of one month exactly as that month', () => {
    const s = { ...defaultSelection('pickMonth'), monthKey: '2026-03', toMonthKey: '2026-03' }
    expect(selectionRange(s)).toEqual(monthRange('2026-03'))
  })

  it('names a run of months by its ends', () => {
    const short = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleString(undefined, { month: 'short' })
    expect(monthSpanLabel('2026-08', '2026-10')).toBe(`${short('2026-08')} – ${short('2026-10')} 2026`)
    expect(monthSpanLabel('2025-11', '2026-02')).toBe(`${short('2025-11')} 2025 – ${short('2026-02')} 2026`)
    expect(monthSpanLabel('2026-10', '2026-08')).toBe(monthSpanLabel('2026-08', '2026-10')) // reversed is swapped
    expect(monthSpanRange('2026-10', '2026-08')).toEqual(monthSpanRange('2026-08', '2026-10'))
  })

  it('resolves chosen days to that day span', () => {
    const s = { ...defaultSelection('pickDays'), fromDay: '2026-03-01', toDay: '2026-03-05' }
    expect(selectionRange(s)).toEqual(dayRange('2026-03-01', '2026-03-05'))
  })

  it('keeps the calendar values while a preset is active, so switching back restores them', () => {
    const s = { ...defaultSelection('today'), monthKey: '2026-01', fromDay: '2026-01-02', toDay: '2026-01-03' }
    expect(selectionRange(s).label).toBe('Today')
    expect(selectionRange({ ...s, mode: 'pickMonth' })).toEqual(monthRange('2026-01'))
  })
})
