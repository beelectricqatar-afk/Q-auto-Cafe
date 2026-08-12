import type { Order } from '../db/schema'

/** One column of the revenue chart. */
export interface RevenuePoint {
  /** Axis label, e.g. "14:00", "5 Aug", "Aug". */
  label: string
  value: number
  from: number
  to: number
}

export type Granularity = 'hour' | 'day' | 'month'

const HOUR = 3600_000
const DAY = 24 * HOUR
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * How finely to slice a window. A single day reads best hour by hour; a few
 * months day by day; anything longer collapses to months so the axis stays
 * legible instead of showing hundreds of columns.
 */
export function granularityFor(spanMs: number): Granularity {
  if (spanMs <= 36 * HOUR) return 'hour'
  if (spanMs <= 92 * DAY) return 'day'
  return 'month'
}

const startOfHour = (t: number) => { const d = new Date(t); d.setMinutes(0, 0, 0); return d.getTime() }
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const startOfMonth = (t: number) => { const d = new Date(t); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime() }

const next = (t: number, g: Granularity) => {
  const d = new Date(t)
  if (g === 'hour') d.setHours(d.getHours() + 1)
  else if (g === 'day') d.setDate(d.getDate() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

const labelFor = (t: number, g: Granularity) => {
  const d = new Date(t)
  if (g === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`
  if (g === 'day') return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short' })
}

/** Hard cap so a pathological range cannot generate unbounded columns. */
const MAX_POINTS = 400

/**
 * Revenue per time slice across `range`, with empty slices kept at zero so the
 * line shows quiet periods rather than skipping them.
 *
 * Named periods carry `to: MAX_SAFE_INTEGER` and "all time" carries `from: 0`,
 * so the window is closed off against now and the earliest order — otherwise the
 * span would be meaningless and the granularity always monthly.
 */
export function revenueSeries(
  orders: Order[],
  range: { from: number; to: number },
  now: number = Date.now(),
): { points: RevenuePoint[]; granularity: Granularity } {
  const inRange = orders.filter(o => o.timestamp >= range.from && o.timestamp < range.to)
  const end = Math.min(range.to, now)
  const earliest = inRange.length ? Math.min(...inRange.map(o => o.timestamp)) : end
  const start = range.from > 0 ? range.from : earliest

  const granularity = granularityFor(Math.max(0, end - start))
  const floor = granularity === 'hour' ? startOfHour : granularity === 'day' ? startOfDay : startOfMonth

  const points: RevenuePoint[] = []
  for (let t = floor(start); t <= end && points.length < MAX_POINTS; t = next(t, granularity)) {
    points.push({ label: labelFor(t, granularity), value: 0, from: t, to: next(t, granularity) })
  }
  if (points.length === 0) return { points, granularity }

  // One pass over the orders rather than a scan per bucket.
  const byStart = new Map(points.map(p => [p.from, p]))
  for (const order of inRange) {
    const bucket = byStart.get(floor(order.timestamp))
    if (bucket) bucket.value += order.total
  }
  for (const p of points) p.value = round2(p.value)
  return { points, granularity }
}

/**
 * Axis ticks: a rounded top and evenly spaced steps, so the labels read as
 * money rather than as whatever the maximum happened to be.
 */
export function axisTicks(max: number, count = 5): number[] {
  if (max <= 0) return Array.from({ length: count + 1 }, (_, i) => i * 20)
  const rawStep = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= rawStep) ?? magnitude * 10
  return Array.from({ length: count + 1 }, (_, i) => round2(i * step))
}

/** Keeps the x-axis readable by showing at most `max` labels, evenly spaced. */
export function labelStride(count: number, max = 12): number {
  return count <= max ? 1 : Math.ceil(count / max)
}

export interface AxisLabelLayout {
  /** Degrees. 0 is flat; negative tilts the text up towards the right. */
  angle: 0 | -45 | -90
  fontSize: number
  /** Show every nth label. 1 — all of them — unless nothing else fits. */
  stride: number
  /** Distance from the plot's bottom edge down to the text anchor. */
  offset: number
  /** Total space the labels need below the plot. */
  height: number
}

// Helvetica/Arial averages a shade under 0.6em per character across mixed case
// and digits — close enough to decide whether a label fits.
const textWidth = (chars: number, fontSize: number) => chars * fontSize * 0.6

/** Roughly how wide a label renders, for spotting one that would be cut off. */
export const labelWidth = (text: string, fontSize: number) => textWidth(text.length, fontSize)

// Tried in order, best-looking first: tilt before shrinking, because a 12px
// label on its side still reads where a 9px flat one does not.
const CANDIDATES: { angle: 0 | -45 | -90; fontSize: number }[] = [
  { angle: 0, fontSize: 12 },
  { angle: -45, fontSize: 12 },
  { angle: -90, fontSize: 12 },
  { angle: -90, fontSize: 10 },
  { angle: -90, fontSize: 9 },
]

/** The horizontal room one label needs, which for tilted text is its height. */
const slotNeeded = (angle: number, fontSize: number, chars: number) =>
  angle === 0 ? textWidth(chars, fontSize) + 8 : fontSize * (angle === -45 ? 1.5 : 1.05)

/**
 * How to draw the x-axis labels so that every one of them is shown.
 *
 * A month picked on the dashboard is 31 columns, and "5 Aug" laid flat needs
 * more width than a column gets — so the axis tilts, and then stands the labels
 * upright, and only then shrinks them. Dropping labels is the last resort, for
 * a span so dense that nothing legible fits; the caller is told via `stride`.
 */
export function axisLabelLayout(labels: string[], step: number): AxisLabelLayout {
  const chars = labels.reduce((most, label) => Math.max(most, label.length), 0)
  const fits = CANDIDATES.find(c => slotNeeded(c.angle, c.fontSize, chars) <= step)
  const { angle, fontSize } = fits ?? CANDIDATES[CANDIDATES.length - 1]

  // Only when even the tightest setting overlaps does a label get dropped.
  const stride = fits ? 1 : labelStride(labels.length, Math.max(1, Math.floor(step * labels.length / slotNeeded(angle, fontSize, chars))))

  if (angle === 0) return { angle, fontSize, stride, offset: fontSize + 10, height: fontSize + 16 }
  // Tilted text hangs below its anchor: at 45° by sin(45) of its length, and
  // upright by the whole of it.
  const run = textWidth(chars, fontSize) * (angle === -45 ? Math.SQRT1_2 : 1)
  const offset = angle === -45 ? fontSize : fontSize - 2
  return { angle, fontSize, stride, offset, height: offset + run + 6 }
}
