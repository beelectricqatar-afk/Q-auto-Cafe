import { dayRange, monthRange, currentMonthKey, todayKey, type FinanceRange } from './finance'
import { periodRange, PERIOD_LABELS, type PeriodKey } from './dateRanges'

/**
 * What the date control is currently set to. The named periods stay one tap
 * away for the everyday views; the `pick*` modes are the calendar options the
 * Finance screen uses, reached through Custom.
 *
 * They are deliberately not called `month`/`days`: PeriodKey already has a
 * `month` meaning "this month", and sharing the name makes the preset and the
 * calendar indistinguishable.
 */
export type RangeMode = PeriodKey | 'pickMonth' | 'pickDays'

export interface RangeSelection {
  mode: RangeMode
  /** `YYYY-MM`, used when mode is `pickMonth`. */
  monthKey: string
  /** `YYYY-MM-DD`, used when mode is `pickDays`. */
  fromDay: string
  toDay: string
}

export const PRESETS = Object.keys(PERIOD_LABELS) as PeriodKey[]
export const isPreset = (mode: RangeMode): mode is PeriodKey => (PRESETS as string[]).includes(mode)

export function defaultSelection(mode: RangeMode = 'today'): RangeSelection {
  return { mode, monthKey: currentMonthKey(), fromDay: todayKey(), toDay: todayKey() }
}

/** The window a selection resolves to, whichever way it was chosen. */
export function selectionRange(s: RangeSelection): FinanceRange {
  if (s.mode === 'pickMonth') return monthRange(s.monthKey)
  if (s.mode === 'pickDays') return dayRange(s.fromDay, s.toDay)
  const p = periodRange(s.mode)
  return { key: p.key, label: p.label, from: p.from, to: p.to }
}
